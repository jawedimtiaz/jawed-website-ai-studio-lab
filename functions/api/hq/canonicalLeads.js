// Canonical Studio HQ Leads API — Phase 8.0.4 WP-2
// Uses the clients table; does not create a separate leads table.
import {
  authorizeHqOwner, readHqJson, requireHqDatabase,
  ownerAuthorizationGuardStatement, conditionalAuditStatement, hqJson
} from '../../lib/hqCanonicalApi.js';
import { checkHqRateLimit } from '../../lib/hqCanonicalRateLimit.js';

const STAGES = new Set(['new','contacted','qualified','proposal-sent','converted','lost']);
const CURRENCIES = new Set(['INR','USD','EUR','GBP','CAD','AUD','SGD','AED','SAR','JPY','KRW','KWD','BHD','OMR']);
const MAX_TEXT = 500;
const LEAD_FIELDS = new Set(['business_name','contact_name','email','phone','website','source','category','notes','estimated_value_minor','currency','next_follow_up_at','pipeline_stage','lost_reason']);

function text(v,max=MAX_TEXT){ return typeof v==='string' ? v.trim().slice(0,max) : ''; }
function safeAmount(v){ return Number.isSafeInteger(v) && v >= 0; }
function statusForStage(stage){ if(stage==='converted') return 'active'; if(stage==='lost') return 'closed'; return ['qualified','proposal-sent'].includes(stage) ? 'prospect' : 'lead'; }
function mapLead(r){
  const labels={new:'New',contacted:'Contacted',qualified:'Qualified','proposal-sent':'Proposal Sent',converted:'Converted',lost:'Lost'};
  return {id:r.id,business_name:r.business_name||r.name||'',contact_name:r.name||'',name:r.name||'',email:r.email||'',phone:r.phone||'',category:r.category||'',website:r.website_url||'',website_url:r.website_url||'',source:r.source||'Direct Enquiry',status:labels[r.pipeline_stage]||'New',canonical_status:r.status,lead_origin:r.lead_origin,pipeline_stage:r.pipeline_stage,estimated_value_minor:r.estimated_value_minor||0,currency:r.currency||'INR',notes:r.notes||'',next_follow_up_at:r.next_follow_up_at||null,converted_client_id:r.pipeline_stage==='converted'?r.id:null,converted_at:r.converted_at||null,lost_at:r.lost_at||null,lost_reason:r.lost_reason||null,archived_at:r.archived_at||null,created_at:r.created_at,updated_at:r.updated_at};
}
function validate(body,partial=false){
  if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'INVALID_INPUT'};
  const unknown=Object.keys(body).filter(k=>!LEAD_FIELDS.has(k));
  if(unknown.length)return {ok:false,error:'UNKNOWN_FIELDS'};
  const out={};
  const strFields=['business_name','contact_name','email','phone','website','source','category','notes','lost_reason'];
  for(const k of strFields) if(k in body){ if(typeof body[k]!=='string')return {ok:false,error:'INVALID_FIELD'}; out[k]=text(body[k],k==='notes'?4000:MAX_TEXT); }
  if('estimated_value_minor' in body){if(!safeAmount(body.estimated_value_minor))return {ok:false,error:'INVALID_AMOUNT'};out.estimated_value_minor=body.estimated_value_minor;}
  if('currency' in body){if(typeof body.currency!=='string'||!CURRENCIES.has(body.currency))return {ok:false,error:'INVALID_CURRENCY'};out.currency=body.currency;}
  if('next_follow_up_at' in body){const v=body.next_follow_up_at;if(v!==null&&(typeof v!=='string'||!Number.isFinite(Date.parse(v))))return {ok:false,error:'INVALID_FOLLOW_UP'};out.next_follow_up_at=v;}
  if('pipeline_stage' in body){if(!STAGES.has(body.pipeline_stage)||body.pipeline_stage==='converted')return {ok:false,error:'INVALID_STAGE'};out.pipeline_stage=body.pipeline_stage;}
  if(!partial){if(!out.business_name||!out.contact_name)return {ok:false,error:'REQUIRED_FIELDS'};out.lead_origin='inbound-lead';out.pipeline_stage='new';out.status='lead';}
  return {ok:true,value:out};
}
function routeError(error,status=400){return hqJson({ok:false,error},status);}
async function list(request,db){
  const u=new URL(request.url);const page=Math.max(1,Number(u.searchParams.get('page'))||1);const limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit'))||25));const q=text(u.searchParams.get('q'),100).toLowerCase();const stage=u.searchParams.get('stage')||u.searchParams.get('status')||'';
  const clauses=["lead_origin='inbound-lead'","archived_at IS NULL"];const args=[];
  if(stage&&stage!=='All'){if(!STAGES.has(stage))return routeError('INVALID_STAGE');clauses.push('pipeline_stage=?');args.push(stage);}else clauses.push("pipeline_stage NOT IN ('converted','lost')");
  if(q){clauses.push("(lower(coalesce(business_name,'')) LIKE ? OR lower(coalesce(name,'')) LIKE ? OR lower(coalesce(email,'')) LIKE ? OR lower(coalesce(phone,'')) LIKE ? OR lower(coalesce(source,'')) LIKE ?)");const p='%'+q+'%';args.push(p,p,p,p,p);}
  const where='WHERE '+clauses.join(' AND ');
  const count=await db.prepare('SELECT COUNT(*) AS total FROM clients '+where).bind(...args).first();
  const rows=await db.prepare('SELECT * FROM clients '+where+' ORDER BY updated_at DESC LIMIT ? OFFSET ?').bind(...args,limit,(page-1)*limit).all();
  return hqJson({success:true,leads:(rows.results||[]).map(mapLead),total:Number(count?.total||0),page,limit});
}
async function create(request,db,identity){
  const parsed=await readHqJson(request);if(!parsed.ok)return parsed.response;
  const v=validate(parsed.value);if(!v.ok)return routeError(v.error);
  const f=v.value;const id=crypto.randomUUID();const now=new Date().toISOString();
  const email=f.email||null;const phone=f.phone||null;
  const stmt=db.prepare(`INSERT INTO clients (id,business_name,name,email,phone,website_url,source,status,lead_origin,pipeline_stage,estimated_value_minor,currency,category,next_follow_up_at,notes,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,f.business_name,f.contact_name,email,phone,f.website||null,f.source||'Direct Enquiry','lead','inbound-lead','new',f.estimated_value_minor||0,f.currency||'INR',f.category||null,f.next_follow_up_at||null,f.notes||null,identity.uid,identity.uid,now,now);
  const batch=[ownerAuthorizationGuardStatement(db,identity),stmt,conditionalAuditStatement(db,identity,'lead.create','client',id,crypto.randomUUID(),null,{business_name:f.business_name,pipeline_stage:'new'})];
  await db.batch(batch);
  const row=await db.prepare('SELECT * FROM clients WHERE id=?').bind(id).first();
  return hqJson({success:true,lead:mapLead(row)},201);
}
async function detail(db,id){return db.prepare("SELECT * FROM clients WHERE id=? AND lead_origin='inbound-lead' AND archived_at IS NULL").bind(id).first();}
async function update(request,db,identity,id){
  const row=await detail(db,id);if(!row)return routeError('LEAD_NOT_FOUND',404);
  const parsed=await readHqJson(request);if(!parsed.ok)return parsed.response;
  const v=validate(parsed.value,true);if(!v.ok)return routeError(v.error);
  const f=v.value;if(!Object.keys(f).length)return routeError('NO_VALID_FIELDS');
  if(row.pipeline_stage==='converted')return routeError('LEAD_ALREADY_CONVERTED',409);
  const stage=f.pipeline_stage||row.pipeline_stage;
  if(stage==='lost'&&!text(f.lost_reason||row.lost_reason))return routeError('LOST_REASON_REQUIRED');
  if(stage!=='lost'&&row.pipeline_stage==='lost'){f.lost_at=null;f.lost_reason=null;}
  const cols={business_name:'business_name',contact_name:'name',email:'email',phone:'phone',website:'website_url',source:'source',category:'category',notes:'notes',estimated_value_minor:'estimated_value_minor',currency:'currency',next_follow_up_at:'next_follow_up_at',lost_reason:'lost_reason'};
  const keys=Object.keys(f).filter(k=>cols[k]);const sets=keys.map(k=>cols[k]+'=?');const vals=keys.map(k=>f[k]);
  if('pipeline_stage'in f){sets.push('pipeline_stage=?','status=?');vals.push(stage,statusForStage(stage));if(stage==='lost')sets.push("lost_at=datetime('now')");if(row.pipeline_stage==='lost'&&stage!=='lost')sets.push('lost_at=NULL','lost_reason=NULL');}
  sets.push("updated_at=datetime('now')","updated_by=?");vals.push(identity.uid,id);
  const update=db.prepare('UPDATE clients SET '+sets.join(',')+" WHERE id=? AND lead_origin='inbound-lead' AND archived_at IS NULL").bind(...vals);
  await db.batch([ownerAuthorizationGuardStatement(db,identity),update,conditionalAuditStatement(db,identity,'lead.update','client',id,crypto.randomUUID(),{pipeline_stage:row.pipeline_stage,status:row.status},{pipeline_stage:stage,status:statusForStage(stage)})]);
  const updated=await detail(db,id);return hqJson({success:true,lead:mapLead(updated)});
}
async function archive(db,identity,id,restore){
  const row=await db.prepare("SELECT * FROM clients WHERE id=? AND lead_origin='inbound-lead'").bind(id).first();if(!row)return routeError('LEAD_NOT_FOUND',404);
  const sql=restore?"UPDATE clients SET archived_at=NULL,archived_by=NULL,updated_at=datetime('now'),updated_by=? WHERE id=? AND archived_at IS NOT NULL":"UPDATE clients SET archived_at=datetime('now'),archived_by=?,updated_at=datetime('now'),updated_by=? WHERE id=? AND archived_at IS NULL";
  const stmt=restore?db.prepare(sql).bind(identity.uid,id):db.prepare(sql).bind(identity.uid,identity.uid,id);
  await db.batch([ownerAuthorizationGuardStatement(db,identity),stmt,conditionalAuditStatement(db,identity,restore?'lead.restore':'lead.archive','client',id,crypto.randomUUID(),{archived_at:row.archived_at},{archived_at:restore?null:'now'})]);
  return hqJson({success:true,id,archived:!restore});
}
async function convert(request,db,identity,id){
  const row=await db.prepare("SELECT * FROM clients WHERE id=? AND lead_origin='inbound-lead' AND archived_at IS NULL").bind(id).first();
  if(!row)return routeError('LEAD_NOT_FOUND',404);if(row.pipeline_stage==='converted')return routeError('ALREADY_CONVERTED',409);if(row.pipeline_stage==='lost')return routeError('LOST_LEAD_CANNOT_CONVERT',409);
  const parsed=await readHqJson(request);if(!parsed.ok)return parsed.response;const body=parsed.value;
  const createProject=body.createProject===true;const projectId=createProject?crypto.randomUUID():null;const now=new Date().toISOString();
  const projectName=text(body.projectName||((row.business_name||row.name)+' Website'),200);
  const projectCode='PRJ-'+projectId?.slice(0,8).toUpperCase();
  const stmts=[ownerAuthorizationGuardStatement(db,identity),db.prepare("UPDATE clients SET status='active',pipeline_stage='converted',converted_at=?,conversion_token=?,lost_at=NULL,lost_reason=NULL,updated_at=?,updated_by=? WHERE id=? AND pipeline_stage<>'converted' AND archived_at IS NULL").bind(now,crypto.randomUUID(),now,identity.uid,id)];
  if(createProject)stmts.push(db.prepare("INSERT INTO projects (id,project_code,client_id,name,project_type,status,priority,currency,quoted_amount_minor,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,'business-website','discovery','normal',?,0,?,?,?,?)").bind(projectId,projectCode,id,projectName,row.currency||'INR',identity.uid,identity.uid,now,now));
  stmts.push(conditionalAuditStatement(db,identity,'lead.convert','client',id,crypto.randomUUID(),{pipeline_stage:row.pipeline_stage,status:row.status},{pipeline_stage:'converted',status:'active',projectId}));
  await db.batch(stmts);return hqJson({success:true,clientId:id,projectId,leadId:id},201);
}
export async function handleHqLeads({request,env,segments=[]}){
  const ip=await checkHqRateLimit(request,env,{type:'general'});if(!ip.ok)return ip.response;
  const auth=await authorizeHqOwner(request,env);if(!auth.ok)return auth.response;
  const dbResult=requireHqDatabase(env);if(!dbResult.ok)return dbResult.response;const db=dbResult.db;const identity=auth.identity;
  const rate=await checkHqRateLimit(request,env,{type:'general',uid:identity.uid});if(!rate.ok)return rate.response;
  if(['POST','PATCH'].includes(request.method)){const write=await checkHqRateLimit(request,env,{type:'write',uid:identity.uid});if(!write.ok)return write.response;}
  try{
    if(segments.length===0){if(request.method==='GET')return list(request,db);if(request.method==='POST')return create(request,db,identity);return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'GET, POST, OPTIONS'});}
    const [id,action]=segments;if(!id||id.length>80)return routeError('LEAD_NOT_FOUND',404);
    if(action==='archive'||action==='restore'){if(request.method==='POST'&&segments.length===2)return archive(db,identity,id,action==='restore');return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'POST, OPTIONS'});}
    if(action==='convert'){if(request.method==='POST'&&segments.length===2)return convert(request,db,identity,id);return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'POST, OPTIONS'});}
    if(action)return routeError('NOT_FOUND',404);
    if(request.method==='GET'){const row=await detail(db,id);return row?hqJson({success:true,lead:mapLead(row)}):routeError('LEAD_NOT_FOUND',404);}
    if(request.method==='PATCH')return update(request,db,identity,id);
    return hqJson({ok:false,error:'METHOD_NOT_ALLOWED'},405,{allow:'GET, PATCH, OPTIONS'});
  }catch(e){console.error('[Studio HQ Leads] Request failed');return hqJson({ok:false,error:'HQ_REQUEST_FAILED'},500);}
}
