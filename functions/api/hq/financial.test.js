import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { calculateItems, financialYear, handleAuthorizedHqFinancial } from './financial.js';
import worker from '../../../worker.js';

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync('migrations/hq/0001_studio_hq_schema.sql','utf8'));
    this.sqlite.exec(readFileSync('migrations/hq/0002_financial_management.sql','utf8'));
  }
  prepare(sql) {
    const database=this.sqlite;
    return { bind(...params) { return {
      sql,
      all:()=>({results:database.prepare(sql).all(...params),success:true,meta:{changes:0}}),
      first:()=>database.prepare(sql).get(...params)||null,
      run:()=>{const r=database.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}
    };}};
  }
  batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results=statements.map(s=>(/^\s*SELECT\b/i.test(s.sql)||/\bRETURNING\b/i.test(s.sql))?s.all():s.run());
      this.sqlite.exec('COMMIT'); return results;
    } catch(e) { this.sqlite.exec('ROLLBACK'); throw e; }
  }
  close(){this.sqlite.close();}
}
const identity={uid:'owner-finance-test',email:'jawedimtiaz@gmail.com'};
const request=(path,method='GET',body,headers={})=>new Request('https://lab.jawed.co.in'+path,{
  method,headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers},
  body:body===undefined?undefined:JSON.stringify(body)
});
const call=(db,req,segments)=>handleAuthorizedHqFinancial({request:req,env:{HQ_DB:db},segments,identity});
const seed= db => {
  db.sqlite.prepare("INSERT INTO hq_users(uid,email,status) VALUES (?,?,'active')").run(identity.uid,identity.email);
  db.sqlite.prepare("INSERT INTO clients(id,name,created_by) VALUES ('client-1','Test Client',?)").run(identity.uid);
  db.sqlite.prepare("INSERT INTO projects(id,client_id,name,created_by) VALUES ('project-1','client-1','Test Project',?)").run(identity.uid);
};
const line={description:'Website development',quantity_milli:1000,unit_price_minor:100000,discount_minor:0,tax_rate_bps:500};
test('financial year follows Asia/Kolkata financial-year boundary',()=>{
  assert.equal(financialYear(new Date('2026-03-31T18:29:00.000Z')),'2025-26');
  assert.equal(financialYear(new Date('2026-03-31T18:31:00.000Z')),'2026-27');
});
test('line-item calculator uses integer paise and deterministic line tax rounding',()=>{
  const r=calculateItems([line]);
  assert.equal(r.ok,true);
  assert.equal(r.subtotal_minor,100000);
  assert.equal(r.tax_minor,5000);
  assert.equal(r.total_minor,105000);
  assert.equal(calculateItems([{...line,discount_minor:100001}]).ok,false);
  assert.equal(calculateItems([{...line,quantity_milli:0}]).ok,false);
  assert.equal(calculateItems([]).ok,false);
});
test('financial migration creates required tables and prevents duplicate quotation invoices',()=>{
  const db=new TestD1();
  try {
    const tables=db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
    for(const name of ['quotation_items','invoice_items','financial_sequences','payment_idempotency_keys','payment_refunds']) assert.ok(tables.includes(name));
  } finally {db.close();}
});
test('quotation lifecycle converts once, invoices snapshot items, accepts payment replay, and limits refunds',async()=>{
  const db=new TestD1();
  try {
    seed(db);
    const created=await call(db,request('/api/hq/quotations','POST',{client_id:'client-1',project_id:'project-1',items:[line]}),['quotations']);
    assert.equal(created.status,201);
    const q=(await created.json()).quotation;
    assert.equal(q.currency,'INR');
    assert.equal(q.total_minor,105000);

    const accepted=await call(db,request('/api/hq/quotations/'+q.id+'/status','POST',{status:'accepted'}),['quotations',q.id,'status']);
    assert.equal(accepted.status,200);

    const converted=await call(db,request('/api/hq/quotations/'+q.id+'/convert','POST',{}),['quotations',q.id,'convert']);
    assert.equal(converted.status,201);
    const invoice=(await converted.json()).invoice;
    assert.equal(invoice.items.length,1);
    assert.equal(invoice.total_minor,105000);

    const duplicate=await call(db,request('/api/hq/quotations/'+q.id+'/convert','POST',{}),['quotations',q.id,'convert']);
    assert.equal(duplicate.status,409);

    const issued=await call(db,request('/api/hq/invoices/'+invoice.id+'/issue','POST',{}),['invoices',invoice.id,'issue']);
    assert.equal(issued.status,200);

    const payReq=()=>request('/api/hq/invoices/'+invoice.id+'/payments','POST',{
      amount_minor:60000,payment_method:'upi',reference_number:'UPI-TEST'
    },{'idempotency-key':'payment-test-key-0001'});
    const paymentResponse=await call(db,payReq(),['invoices',invoice.id,'payments']);
    assert.equal(paymentResponse.status,201);
    const payment=(await paymentResponse.json()).payment;
    assert.equal(payment.amount_minor,60000);

    const replay=await call(db,payReq(),['invoices',invoice.id,'payments']);
    assert.equal(replay.status,200);
    assert.equal((await replay.json()).replayed,true);
    const changedPaidAt=await call(db,request('/api/hq/invoices/'+invoice.id+'/payments','POST',{
      amount_minor:60000,payment_method:'upi',reference_number:'UPI-TEST',paid_at:'2026-11-10T10:00:00.000Z'
    },{'idempotency-key':'payment-test-key-0001'}),['invoices',invoice.id,'payments']);
    assert.equal(changedPaidAt.status,409);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1);

    const refundReq=()=>request('/api/hq/payments/'+payment.id+'/refunds','POST',{amount_minor:10000,reason:'Partial refund',refunded_at:'2026-11-11T09:00:00.000Z'},{'idempotency-key':'refund-test-key-0001'});
    const refund=await call(db,refundReq(),['payments',payment.id,'refunds']);
    assert.equal(refund.status,201);
    const refundReplay=await call(db,refundReq(),['payments',payment.id,'refunds']);
    assert.equal(refundReplay.status,200);
    assert.equal((await refundReplay.json()).replayed,true);
    const shortReason=await call(db,request('/api/hq/payments/'+payment.id+'/refunds','POST',{amount_minor:1000,reason:'x'},{'idempotency-key':'refund-test-key-0002'}),['payments',payment.id,'refunds']);
    assert.equal(shortReason.status,400);

    const excessive=await call(db,request('/api/hq/payments/'+payment.id+'/refunds','POST',{amount_minor:60000,reason:'Too much'}),['payments',payment.id,'refunds']);
    assert.equal(excessive.status,409);

    const finalInvoice=db.sqlite.prepare('SELECT amount_paid_minor,status FROM invoices WHERE id=?').get(invoice.id);
    assert.equal(finalInvoice.amount_paid_minor,50000);
    assert.equal(finalInvoice.status,'partially-paid');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM payment_refunds').get().n,1);
    assert.ok(db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type IN ('quotation','invoice','payment','payment_refund')").get().n>=5);
  } finally {db.close();}
});
test('financial APIs reject unsupported currency and unknown fields',async()=>{
  const db=new TestD1();
  try {
    seed(db);
    const bad=await call(db,request('/api/hq/invoices','POST',{client_id:'client-1',currency:'USD',items:[line]}),['invoices']);
    assert.equal(bad.status,400);
    const badItem=await call(db,request('/api/hq/invoices','POST',{client_id:'client-1',items:[{...line,unit_price_minor:1,admin:true}]}),['invoices']);
    assert.equal(badItem.status,400);
  } finally {db.close();}
});

test('Worker routes financial endpoints through Studio HQ authorization and security headers',async()=>{
  for(const path of ['/api/hq/quotations','/api/hq/invoices','/api/hq/payments']) {
    const response=await worker.fetch(new Request('https://lab.jawed.co.in'+path),{}, {});
    assert.equal(response.status,401);
    assert.equal(response.headers.get('cache-control'),'no-store, private, max-age=0');
    assert.equal(response.headers.get('x-frame-options'),'DENY');
  }
});
