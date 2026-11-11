import {
  authorizeHqOwner, hqJson, readHqJson, requireHqDatabase,
  ownerAuthorizationGuardStatement, auditStatement, conditionalAuditStatement
} from '../../lib/hqApi.js';
import { checkHqRateLimit } from '../../lib/hqRateLimit.js';

const MAX_MINOR = 9000000000000;
const STATUSES = new Set(['sent','accepted','rejected','expired','withdrawn']);
const METHODS = new Set(['bank-transfer','upi','cash','card','other']);

function validText(value, max, required = false) {
  if (value === undefined || value === null) return required ? null : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length <= max && (!required || s.length > 0) ? s : null;
}
function validDate(value, optional = true) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== value ? undefined : value;
}
function safeAmount(v) { return Number.isSafeInteger(v) && v >= 0 && v <= MAX_MINOR; }
function roundedBigIntDivision(numerator, denominator) { return (numerator + denominator / 2n) / denominator; }
export function indiaDate(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).format(date); }
export function financialYear(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit' }).formatToParts(date);
  const y = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value);
  const start = month >= 4 ? y : y - 1;
  return String(start) + '-' + String((start + 1) % 100).padStart(2, '0');
}
export function calculateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) return { ok:false, error:'ITEMS_INVALID' };
  const output = [];
  let subtotal = 0, tax = 0, total = 0;
  for (let i = 0; i < items.length; i++) {
    const x = items[i];
    if (!x || typeof x !== 'object' || Array.isArray(x) ||
        Object.keys(x).some(k => !['description','quantity_milli','unit_price_minor','discount_minor','tax_rate_bps'].includes(k))) {
      return { ok:false, error:'ITEM_FIELDS_INVALID' };
    }
    const description = validText(x.description, 500, true);
    if (!description || !Number.isSafeInteger(x.quantity_milli) || x.quantity_milli < 1 || x.quantity_milli > 1000000000 ||
        !safeAmount(x.unit_price_minor) || !safeAmount(x.discount_minor ?? 0) ||
        !Number.isInteger(x.tax_rate_bps ?? 0) || (x.tax_rate_bps ?? 0) < 0 || (x.tax_rate_bps ?? 0) > 10000) {
      return { ok:false, error:'ITEM_VALUE_INVALID' };
    }
    const baseBig = roundedBigIntDivision(BigInt(x.quantity_milli) * BigInt(x.unit_price_minor), 1000n);
    if (baseBig > BigInt(Number.MAX_SAFE_INTEGER)) return { ok:false, error:'AMOUNT_OUT_OF_RANGE' };
    const base = Number(baseBig);
    const discount = x.discount_minor ?? 0;
    if (!Number.isSafeInteger(base) || discount > base) return { ok:false, error:'ITEM_AMOUNT_INVALID' };
    const taxable = base - discount;
    const rate = x.tax_rate_bps ?? 0;
    const lineTaxBig = roundedBigIntDivision(BigInt(taxable) * BigInt(rate), 10000n);
    if (lineTaxBig > BigInt(Number.MAX_SAFE_INTEGER)) return { ok:false, error:'AMOUNT_OUT_OF_RANGE' };
    const lineTax = Number(lineTaxBig);
    const lineTotal = taxable + lineTax;
    if (![lineTax,lineTotal].every(Number.isSafeInteger) || lineTotal > MAX_MINOR) return { ok:false, error:'AMOUNT_OUT_OF_RANGE' };
    subtotal += taxable; tax += lineTax; total += lineTotal;
    if (![subtotal,tax,total].every(Number.isSafeInteger) || total > MAX_MINOR) return { ok:false, error:'AMOUNT_OUT_OF_RANGE' };
    output.push({ description, quantity_milli:x.quantity_milli, unit_price_minor:x.unit_price_minor,
      discount_minor:discount, tax_rate_bps:rate, tax_minor:lineTax, line_total_minor:lineTotal, sort_order:i });
  }
  return { ok:true, items:output, subtotal_minor:subtotal, tax_minor:tax, total_minor:total };
}
function error(code, status = 400) { return hqJson({ok:false,error:code},status); }
async function validClientProject(db, clientId, projectId) {
  const client = await db.prepare('SELECT id FROM clients WHERE id = ? AND archived_at IS NULL').bind(clientId).first();
  if (!client) return false;
  if (!projectId) return true;
  return !!(await db.prepare('SELECT id FROM projects WHERE id = ? AND client_id = ? AND archived_at IS NULL').bind(projectId,clientId).first());
}
async function allocateNumber(db, type, identity) {
  const fy = financialYear();
  const prefix = type === 'quotation' ? 'QUO' : 'INV';
  const id = type + ':' + fy;
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    db.prepare(`INSERT INTO financial_sequences (id,document_type,prefix,financial_year,next_number)
      VALUES (?,?,?,?,1) ON CONFLICT(document_type,financial_year) DO NOTHING`).bind(id,type,prefix,fy),
    db.prepare(`UPDATE financial_sequences SET next_number = next_number + 1,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE document_type = ? AND financial_year = ? RETURNING prefix, financial_year, next_number - 1 AS allocated`).bind(type,fy)
  ]);
  const row = results?.[2]?.results?.[0];
  if (!row || !Number.isSafeInteger(row.allocated)) throw new Error('SEQUENCE_ALLOCATION_FAILED');
  return row.prefix + '/' + row.financial_year + '/' + String(row.allocated).padStart(4,'0');
}
function itemInsert(db, table, parentColumn, parentId, items) {
  return items.map(item => db.prepare(`INSERT INTO ${table}
    (id,${parentColumn},description,quantity_milli,unit_price_minor,discount_minor,tax_rate_bps,tax_minor,line_total_minor,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),parentId,item.description,item.quantity_milli,
      item.unit_price_minor,item.discount_minor,item.tax_rate_bps,item.tax_minor,item.line_total_minor,item.sort_order));
}
async function listDocuments(db, table, request) {
  const url = new URL(request.url);
  const limit = Math.min(100,Math.max(1,Number.parseInt(url.searchParams.get('limit') || '50',10) || 50));
  const offset = Math.min(10000,Math.max(0,Number.parseInt(url.searchParams.get('offset') || '0',10) || 0));
  const status = url.searchParams.get('status');
  const clientId = url.searchParams.get('clientId');
  const allowed = table === 'quotations' ? ['draft',...STATUSES] : ['draft','issued','partially-paid','paid','overdue','void'];
  if (status && !allowed.includes(status)) return error('STATUS_INVALID');
  if (table === 'invoices') {
    const netPaid = `((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=i.id AND p.archived_at IS NULL)
      - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=i.id))`;
    const effective = `CASE WHEN i.status IN ('draft','void') THEN i.status
      WHEN i.total_minor <= ${netPaid} THEN 'paid'
      WHEN i.due_on IS NOT NULL AND i.due_on < ? THEN 'overdue'
      WHEN ${netPaid} > 0 THEN 'partially-paid' ELSE 'issued' END`;
    const clauses = ['i.archived_at IS NULL'], params = [indiaDate()];
    if (status) { clauses.push(`(${effective}) = ?`); params.push(indiaDate(),status); }
    if (clientId) { clauses.push('i.client_id = ?'); params.push(clientId); }
    const result = await db.prepare(`SELECT i.*, (${netPaid}) AS calculated_amount_paid_minor, ${effective} AS effective_status
      FROM invoices i WHERE ${clauses.join(' AND ')} ORDER BY i.created_at DESC,i.id LIMIT ? OFFSET ?`)
      .bind(...params,limit,offset).all();
    const invoices=(result.results || []).map(row=>({...row,amount_paid_minor:row.calculated_amount_paid_minor,status:row.effective_status}));
    return hqJson({ok:true,[table]:invoices,limit,offset});
  }
  const clauses = ['archived_at IS NULL'], params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (clientId) { clauses.push('client_id = ?'); params.push(clientId); }
  const result = await db.prepare(`SELECT * FROM ${table} WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`)
    .bind(...params,limit,offset).all();
  return hqJson({ok:true,[table]:result.results || [],limit,offset});
}
async function createDocument(request, db, identity, type) {
  const parsed = await readHqJson(request); if (!parsed.ok) return parsed.response;
  const x = parsed.value;
  const allowed = new Set(type === 'quotation' ? ['client_id','project_id','items','valid_until','terms_markdown'] : ['client_id','project_id','items','due_on','notes']);
  if (Object.keys(x).some(k => !allowed.has(k))) return error('FIELD_NOT_ALLOWED');
  const clientId = validText(x.client_id,80,true), projectId = x.project_id ? validText(x.project_id,80,true) : null;
  if (!clientId) return error('CLIENT_ID_REQUIRED');
  if (x.project_id && !projectId) return error('PROJECT_ID_INVALID');
  if (!await validClientProject(db,clientId,projectId)) return error('CLIENT_OR_PROJECT_NOT_FOUND',404);
  const calculated = calculateItems(x.items);
  if (!calculated.ok) return error(calculated.error);
  const dateField = type === 'quotation' ? 'valid_until' : 'due_on';
  const date = validDate(x[dateField]);
  if (date === undefined) return error(dateField.toUpperCase() + '_INVALID');
  const note = validText(type === 'quotation' ? x.terms_markdown : x.notes,4000);
  if ((type === 'quotation' ? x.terms_markdown : x.notes) != null && note === null) return error('TEXT_INVALID');
  const number = await allocateNumber(db,type,identity);
  const id = crypto.randomUUID();
  const table = type === 'quotation' ? 'quotations' : 'invoices';
  const insert = type === 'quotation'
    ? db.prepare(`INSERT INTO quotations (id,quote_number,client_id,project_id,status,currency,subtotal_minor,tax_minor,total_minor,valid_until,terms_markdown,created_by)
      VALUES (?,?,?,?,'draft','INR',?,?,?,?,?,?) RETURNING *`).bind(id,number,clientId,projectId,calculated.subtotal_minor,calculated.tax_minor,calculated.total_minor,date,note,identity.uid)
    : db.prepare(`INSERT INTO invoices (id,invoice_number,client_id,project_id,status,currency,subtotal_minor,tax_minor,total_minor,amount_paid_minor,due_on,notes,created_by)
      VALUES (?,?,?,?,'draft','INR',?,?,?,0,?,?,?) RETURNING *`).bind(id,number,clientId,projectId,calculated.subtotal_minor,calculated.tax_minor,calculated.total_minor,date,note,identity.uid);
  const items = itemInsert(db,type === 'quotation' ? 'quotation_items' : 'invoice_items',type === 'quotation' ? 'quotation_id' : 'invoice_id',id,calculated.items);
  const results = await db.batch([ownerAuthorizationGuardStatement(db,identity),insert,...items,
    auditStatement(db,identity,type + '.create',type,id,crypto.randomUUID(),null,{number,client_id:clientId,project_id:projectId,total_minor:calculated.total_minor,currency:'INR'})]);
  const row = results?.[1]?.results?.[0];
  return row ? hqJson({ok:true,[type]:row,items:calculated.items},201) : error(type.toUpperCase() + '_CREATE_FAILED',500);
}
async function getDocument(db, type, id) {
  const table = type === 'quotation' ? 'quotations' : 'invoices';
  const row = type === 'invoice'
    ? await db.prepare(`SELECT i.*,
        ((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=i.id AND p.archived_at IS NULL)
        - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=i.id)) AS calculated_amount_paid_minor,
        CASE WHEN i.status IN ('draft','void') THEN i.status
          WHEN i.total_minor <= ((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=i.id AND p.archived_at IS NULL)
            - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=i.id)) THEN 'paid'
          WHEN i.due_on IS NOT NULL AND i.due_on < ? THEN 'overdue'
          WHEN ((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=i.id AND p.archived_at IS NULL)
            - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=i.id)) > 0 THEN 'partially-paid'
          ELSE 'issued' END AS effective_status
        FROM invoices i WHERE i.id=? AND i.archived_at IS NULL`).bind(indiaDate(),id).first()
    : await db.prepare(`SELECT * FROM quotations WHERE id = ? AND archived_at IS NULL`).bind(id).first();
  if (!row) return null;
  const items = await db.prepare(`SELECT * FROM ${type === 'quotation' ? 'quotation_items' : 'invoice_items'} WHERE ${type === 'quotation' ? 'quotation_id' : 'invoice_id'} = ? ORDER BY sort_order,id`).bind(id).all();
  if(type==='invoice') {
    row.amount_paid_minor=row.calculated_amount_paid_minor;
    row.status=row.effective_status;
    delete row.calculated_amount_paid_minor;
    delete row.effective_status;
  }
  return { ...row, items:items.results || [] };
}
async function updateQuotation(request, db, identity, id) {
  const existing = await db.prepare("SELECT * FROM quotations WHERE id = ? AND archived_at IS NULL").bind(id).first();
  if (!existing) return error('QUOTATION_NOT_FOUND',404);
  if (existing.status !== 'draft') return error('ONLY_DRAFT_QUOTATIONS_EDITABLE',409);
  const parsed = await readHqJson(request); if (!parsed.ok) return parsed.response;
  const x = parsed.value;
  if (Object.keys(x).some(k => !['valid_until','terms_markdown'].includes(k))) return error('FIELD_NOT_ALLOWED');
  const date = x.valid_until === undefined ? existing.valid_until : validDate(x.valid_until);
  if (date === undefined) return error('VALID_UNTIL_INVALID');
  const terms = x.terms_markdown === undefined ? existing.terms_markdown : validText(x.terms_markdown,4000);
  if (x.terms_markdown !== undefined && x.terms_markdown !== null && terms === null) return error('TERMS_INVALID');
  const update = db.prepare(`UPDATE quotations SET valid_until=?,terms_markdown=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=? AND status='draft' AND archived_at IS NULL`).bind(date,terms,id);
  const results = await db.batch([ownerAuthorizationGuardStatement(db,identity),update,
    conditionalAuditStatement(db,identity,'quotation.update','quotation',id,crypto.randomUUID(),
      {valid_until:existing.valid_until,terms_markdown:existing.terms_markdown},{valid_until:date,terms_markdown:terms})]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return error('QUOTATION_NOT_EDITABLE',409);
  return hqJson({ok:true,quotation:await getDocument(db,'quotation',id)});
}
async function setQuotationStatus(request, db, identity, id) {
  const parsed = await readHqJson(request); if (!parsed.ok) return parsed.response;
  if (Object.keys(parsed.value).some(k => k !== 'status')) return error('FIELD_NOT_ALLOWED');
  const status = parsed.value.status;
  if (!STATUSES.has(status)) return error('QUOTATION_STATUS_INVALID');
  const existing = await db.prepare('SELECT status FROM quotations WHERE id=? AND archived_at IS NULL').bind(id).first();
  if (!existing) return error('QUOTATION_NOT_FOUND',404);
  const result = await db.batch([ownerAuthorizationGuardStatement(db,identity),
    db.prepare("UPDATE quotations SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='draft'").bind(status,id),
    conditionalAuditStatement(db,identity,'quotation.status','quotation',id,crypto.randomUUID(),{status:existing.status},{status})]);
  if ((result?.[1]?.meta?.changes ?? 0) !== 1) return error('QUOTATION_STATUS_CONFLICT',409);
  return hqJson({ok:true,quotation:await getDocument(db,'quotation',id)});
}
async function convertQuotation(db, identity, id) {
  const quote = await db.prepare("SELECT * FROM quotations WHERE id=? AND archived_at IS NULL AND status='accepted'").bind(id).first();
  if (!quote) return error('ACCEPTED_QUOTATION_NOT_FOUND',404);
  const existing = await db.prepare('SELECT id FROM invoices WHERE quotation_id=?').bind(id).first();
  if (existing) return error('QUOTATION_ALREADY_CONVERTED',409);
  const items = await db.prepare('SELECT * FROM quotation_items WHERE quotation_id=? ORDER BY sort_order,id').bind(id).all();
  if (!items.results?.length) return error('QUOTATION_ITEMS_MISSING',409);
  const number = await allocateNumber(db,'invoice',identity), invoiceId = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO invoices (id,invoice_number,client_id,project_id,quotation_id,status,currency,subtotal_minor,tax_minor,total_minor,amount_paid_minor,notes,created_by)
    VALUES (?,?,?,?,?,'draft','INR',?,?,?,0,?,?) RETURNING *`)
    .bind(invoiceId,number,quote.client_id,quote.project_id,id,quote.subtotal_minor,quote.tax_minor,quote.total_minor,quote.terms_markdown,identity.uid);
  const statements = [ownerAuthorizationGuardStatement(db,identity),insert,
    ...items.results.map(x=>db.prepare(`INSERT INTO invoice_items (id,invoice_id,description,quantity_milli,unit_price_minor,discount_minor,tax_rate_bps,tax_minor,line_total_minor,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),invoiceId,x.description,x.quantity_milli,x.unit_price_minor,x.discount_minor,x.tax_rate_bps,x.tax_minor,x.line_total_minor,x.sort_order)),
    auditStatement(db,identity,'quotation.convert','quotation',id,crypto.randomUUID(),{status:'accepted'},{invoice_id:invoiceId,invoice_number:number})];
  try {
    const results = await db.batch(statements);
    return results?.[1]?.results?.[0] ? hqJson({ok:true,invoice:await getDocument(db,'invoice',invoiceId)},201) : error('INVOICE_CONVERSION_FAILED',500);
  } catch (e) {
    if (String(e?.message || '').includes('UNIQUE')) return error('QUOTATION_ALREADY_CONVERTED',409);
    throw e;
  }
}
async function issueInvoice(db, identity, id) {
  const existing = await db.prepare('SELECT * FROM invoices WHERE id=? AND archived_at IS NULL').bind(id).first();
  if (!existing) return error('INVOICE_NOT_FOUND',404);
  const result = await db.batch([ownerAuthorizationGuardStatement(db,identity),
    db.prepare("UPDATE invoices SET status=CASE WHEN due_on IS NOT NULL AND due_on < ? THEN 'overdue' ELSE 'issued' END,issued_on=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='draft' AND total_minor>0").bind(indiaDate(),indiaDate(),id),
    conditionalAuditStatement(db,identity,'invoice.issue','invoice',id,crypto.randomUUID(),{status:'draft'},{status:'issued'})]);
  if ((result?.[1]?.meta?.changes ?? 0) !== 1) return error('INVOICE_NOT_ISSUABLE',409);
  return hqJson({ok:true,invoice:await getDocument(db,'invoice',id)});
}
async function addPayment(request, db, identity, invoiceId) {
  const parsed = await readHqJson(request); if (!parsed.ok) return parsed.response;
  const x = parsed.value;
  if (Object.keys(x).some(k=>!['amount_minor','payment_method','reference_number','paid_at','notes'].includes(k))) return error('FIELD_NOT_ALLOWED');
  if (!Number.isSafeInteger(x.amount_minor) || x.amount_minor <= 0 || x.amount_minor > MAX_MINOR) return error('PAYMENT_AMOUNT_INVALID');
  if (x.payment_method != null && !METHODS.has(x.payment_method)) return error('PAYMENT_METHOD_INVALID');
  const ref = validText(x.reference_number,120), notes = validText(x.notes,1000);
  if ((x.reference_number != null && ref === null) || (x.notes != null && notes === null)) return error('PAYMENT_TEXT_INVALID');
  const paidAt = x.paid_at == null ? new Date().toISOString() : (typeof x.paid_at === 'string' && !Number.isNaN(Date.parse(x.paid_at)) ? new Date(x.paid_at).toISOString() : null);
  if (!paidAt) return error('PAID_AT_INVALID');
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) return error('IDEMPOTENCY_KEY_REQUIRED');
  const fingerprint = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({invoiceId,amount_minor:x.amount_minor,payment_method:x.payment_method ?? null,reference_number:ref,paid_at:x.paid_at == null ? null : paidAt,notes})));
  const hash = [...new Uint8Array(fingerprint)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const prior = await db.prepare('SELECT invoice_id,payment_id,request_fingerprint FROM payment_idempotency_keys WHERE idempotency_key=?').bind(key).first();
  if (prior) return prior.invoice_id === invoiceId && prior.request_fingerprint === hash
    ? hqJson({ok:true,replayed:true,payment:await db.prepare('SELECT * FROM payments WHERE id=?').bind(prior.payment_id).first()})
    : error('IDEMPOTENCY_KEY_REUSED',409);
  const paymentId=crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO payments (id,invoice_id,amount_minor,currency,payment_method,reference_number,paid_at,recorded_by,notes)
    SELECT ?,id,?,'INR',?,?,?,?,? FROM invoices i
    WHERE i.id=? AND i.status IN ('issued','partially-paid','overdue')
      AND i.total_minor - (SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=i.id)
          + (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=i.id) >= ?`)
    .bind(paymentId,x.amount_minor,x.payment_method ?? null,ref,paidAt,identity.uid,notes,invoiceId,x.amount_minor);
  const idem = db.prepare(`INSERT INTO payment_idempotency_keys (id,idempotency_key,invoice_id,payment_id,request_fingerprint)
    SELECT ?,?,?,?,? WHERE changes()=1`).bind(crypto.randomUUID(),key,invoiceId,paymentId,hash);
  const results = await db.batch([ownerAuthorizationGuardStatement(db,identity),insert,idem,
    db.prepare(`UPDATE invoices SET amount_paid_minor =
      (SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=? AND p.archived_at IS NULL)
      - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=?),
      status=CASE
        WHEN total_minor <= ((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=? AND p.archived_at IS NULL)
          - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=?)) THEN 'paid'
        WHEN due_on IS NOT NULL AND due_on < ? THEN 'overdue'
        WHEN ((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=? AND p.archived_at IS NULL)
          - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=?)) > 0 THEN 'partially-paid'
        ELSE 'issued' END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND changes()=1`).bind(invoiceId,invoiceId,invoiceId,invoiceId,indiaDate(),invoiceId,invoiceId,invoiceId),
    conditionalAuditStatement(db,identity,'payment.record','payment',paymentId,crypto.randomUUID(),null,{invoice_id:invoiceId,amount_minor:x.amount_minor,currency:'INR'})]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return error('PAYMENT_NOT_ALLOWED_OR_EXCEEDS_BALANCE',409);
  return hqJson({ok:true,payment:await db.prepare('SELECT * FROM payments WHERE id=?').bind(paymentId).first()},201);
}
async function addRefund(request, db, identity, paymentId) {
  const parsed=await readHqJson(request); if(!parsed.ok)return parsed.response;
  const x=parsed.value;
  if(Object.keys(x).some(k=>!['amount_minor','reason','refunded_at'].includes(k)))return error('FIELD_NOT_ALLOWED');
  if(!Number.isSafeInteger(x.amount_minor)||x.amount_minor<=0||x.amount_minor>MAX_MINOR)return error('REFUND_AMOUNT_INVALID');
  const reason=validText(x.reason,1000,true); if(!reason || reason.length<2)return error('REFUND_REASON_INVALID');
  const refundedAt=x.refunded_at==null?new Date().toISOString():(typeof x.refunded_at==='string'&&!Number.isNaN(Date.parse(x.refunded_at))?new Date(x.refunded_at).toISOString():null);
  if(!refundedAt)return error('REFUNDED_AT_INVALID');
  const key=request.headers.get('idempotency-key')||'';
  if(!/^[A-Za-z0-9._:-]{16,128}$/.test(key))return error('IDEMPOTENCY_KEY_REQUIRED');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({paymentId,amount_minor:x.amount_minor,reason,refunded_at:refundedAt})));
  const fingerprint=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const prior=await db.prepare('SELECT payment_id,refund_id,request_fingerprint FROM refund_idempotency_keys WHERE idempotency_key=?').bind(key).first();
  if(prior) return prior.payment_id===paymentId && prior.request_fingerprint===fingerprint
    ? hqJson({ok:true,replayed:true,refund:await db.prepare('SELECT * FROM payment_refunds WHERE id=?').bind(prior.refund_id).first()})
    : error('IDEMPOTENCY_KEY_REUSED',409);
  const id=crypto.randomUUID();
  const insert=db.prepare(`INSERT INTO payment_refunds (id,payment_id,amount_minor,reason,refunded_at,recorded_by)
    SELECT ?,p.id,?,?,?,? FROM payments p JOIN invoices i ON i.id=p.invoice_id
    WHERE p.id=? AND p.archived_at IS NULL AND i.status <> 'void'
      AND p.amount_minor - (SELECT COALESCE(SUM(amount_minor),0) FROM payment_refunds WHERE payment_id=p.id) >= ?`)
    .bind(id,x.amount_minor,reason,refundedAt,identity.uid,paymentId,x.amount_minor);
  const idem=db.prepare(`INSERT INTO refund_idempotency_keys (id,idempotency_key,payment_id,refund_id,request_fingerprint)
    SELECT ?,?,?,?,? WHERE changes()=1`).bind(crypto.randomUUID(),key,paymentId,id,fingerprint);
  const results=await db.batch([ownerAuthorizationGuardStatement(db,identity),insert,idem,
    db.prepare(`UPDATE invoices SET amount_paid_minor =
      (SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=invoices.id AND p.archived_at IS NULL)
      - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=invoices.id),
      status=CASE
        WHEN total_minor <= ((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=invoices.id AND p.archived_at IS NULL)
          - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=invoices.id)) THEN 'paid'
        WHEN due_on IS NOT NULL AND due_on < ? THEN 'overdue'
        WHEN ((SELECT COALESCE(SUM(p.amount_minor),0) FROM payments p WHERE p.invoice_id=invoices.id AND p.archived_at IS NULL)
          - (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=invoices.id)) > 0 THEN 'partially-paid'
        ELSE 'issued' END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=(SELECT invoice_id FROM payments WHERE id=?) AND changes()=1`).bind(indiaDate(),paymentId),
    conditionalAuditStatement(db,identity,'payment.refund','payment_refund',id,crypto.randomUUID(),null,{payment_id:paymentId,amount_minor:x.amount_minor,reason})]);
  if((results?.[1]?.meta?.changes ?? 0)!==1)return error('REFUND_EXCEEDS_REMAINING_PAYMENT',409);
  return hqJson({ok:true,refund:await db.prepare('SELECT * FROM payment_refunds WHERE id=?').bind(id).first()},201);
}
export async function handleAuthorizedHqFinancial({request,env,segments,identity}) {
  const dbResult=requireHqDatabase(env); if(!dbResult.ok)return dbResult.response;
  const db=dbResult.db;
  try {
    if(['POST','PATCH'].includes(request.method)) { const limit=await checkHqRateLimit(request,env,{type:'write',uid:identity.uid}); if(!limit.ok)return limit.response; }
    const [resource,id,action]=segments;
    if(resource==='quotations') {
      if(!id) {
        if(request.method==='GET')return listDocuments(db,'quotations',request);
        if(request.method==='POST')return createDocument(request,db,identity,'quotation');
        return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'GET, POST'});
      }
      if(id.length>80)return error('QUOTATION_NOT_FOUND',404);
      if(!action) {
        if(request.method==='GET') { const q=await getDocument(db,'quotation',id); return q?hqJson({ok:true,quotation:q}):error('QUOTATION_NOT_FOUND',404); }
        if(request.method==='PATCH')return updateQuotation(request,db,identity,id);
        return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'GET, PATCH'});
      }
      if(action==='status'&&request.method==='POST')return setQuotationStatus(request,db,identity,id);
      if(action==='convert'&&request.method==='POST')return convertQuotation(db,identity,id);
      return error('NOT_FOUND',404);
    }
    if(resource==='invoices') {
      if(!id) {
        if(request.method==='GET')return listDocuments(db,'invoices',request);
        if(request.method==='POST')return createDocument(request,db,identity,'invoice');
        return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'GET, POST'});
      }
      if(id.length>80)return error('INVOICE_NOT_FOUND',404);
      if(!action) {
        if(request.method==='GET') { const inv=await getDocument(db,'invoice',id); return inv?hqJson({ok:true,invoice:inv}):error('INVOICE_NOT_FOUND',404); }
        return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
      }
      if(action==='issue'&&request.method==='POST')return issueInvoice(db,identity,id);
      if(action==='payments'&&request.method==='GET') {
        const rows=await db.prepare('SELECT * FROM payments WHERE invoice_id=? AND archived_at IS NULL ORDER BY paid_at DESC').bind(id).all();
        return hqJson({ok:true,payments:rows.results||[]});
      }
      if(action==='payments'&&request.method==='POST')return addPayment(request,db,identity,id);
      return error('NOT_FOUND',404);
    }
    if(resource==='payments'&&id&&action==='refunds'&&request.method==='POST')return addRefund(request,db,identity,id);
    return error('NOT_FOUND',404);
  } catch(e) {
    console.error('[Studio HQ] Financial API operation failed:',e?.message||e);
    return error('HQ_REQUEST_FAILED',500);
  }
}
export async function handleHqFinancial({request,env,segments}) {
  const auth=await authorizeHqOwner(request,env); if(!auth.ok)return auth.response;
  return handleAuthorizedHqFinancial({request,env,segments,identity:auth.identity});
}
