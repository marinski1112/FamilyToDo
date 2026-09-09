import { formatFamilyDateTime, utcNow } from './timezone';

type Row=Record<string,unknown>;
type Kind='TASK'|'SHOPPING'|'ITEM';
export type ChecklistRoute={kind:Kind;names:string[];date:string|null;reason:string|null};
const kinds:Record<string,Kind>={'タスク':'TASK','買い物':'SHOPPING','持ち物':'ITEM'};
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;

/** Explicit checklist grammar only; no AI guessing, subject selection or inferred parent. */
export function parseChecklistRoute(value:unknown,due:unknown,updated:unknown,timeZone:string):ChecklistRoute|null{
  // Keep established FT quantity/task commands with the existing parser.
  if(/^(?:FT|FAMILY TODO|ファミリーTODO)\s+(?:買い物|タスク)\s/i.test(String(value||'').normalize('NFKC').trim()))return null;
  const title=String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().replace(/^(?:FT|FAMILY TODO|ファミリーTODO) /i,'');
  const day='(今日|明日|明後日|\\d{4}-\\d{2}-\\d{2})';
  let names='',label='',dateWord='';
  const suffix=new RegExp('^(.+?)を(?:'+day+'の?)?(タスク|買い物|持ち物)(?:リスト)?に追加(?:して(?:ください)?)?[。！!]?$').exec(title);
  const prefix=new RegExp('^(?:'+day+'の?)?(タスク|買い物|持ち物)(?:リスト)?[ :：]+(.+)$').exec(title);
  const buy=new RegExp('^(?:'+day+'[、, ]*)?(.+?)を買って(?:ください)?[。！!]?$').exec(title);
  if(suffix){names=suffix[1];dateWord=suffix[2]||'';label=suffix[3];}
  else if(prefix){dateWord=prefix[1]||'';label=prefix[2];names=prefix[3];}
  else if(buy){dateWord=buy[1]||'';names=buy[2];label='買い物';}
  else return null;
  const result:ChecklistRoute={kind:kinds[label],names:[],date:null,reason:null};
  const fail=(reason:string)=>({...result,reason});
  if(title.length>1000)return fail('INPUT_TOO_LONG');
  // Instructions with another date, a parent target, a question or an alternative need review.
  if(/(?:今日|明日|明後日|昨日|来週|来月|[月火水木金土日]曜日|\d+[月日時分]|\d{4}-\d{2}-\d{2}|(?:タスク|イベント|買い物|持ち物)に|どちら|または|それとも|[?？])/.test(names))return fail('AMBIGUOUS_INSTRUCTION');
  const parts=names.split(/[、,]/.test(names)?/[、,]/:/と/).map(s=>s.trim());
  if(parts.length>20||parts.some(s=>!s||s.length>255))return fail('INVALID_ITEMS');
  if(parts.some(s=>/\s\d+$|[×x]\s*\d+$|\d+(?:個|本|枚|袋|パック)$/.test(s)))return fail('QUANTITY_NEEDS_REVIEW');
  result.names=[...new Set(parts)];
  const externalDate=String(due||'').slice(0,10);
  if(externalDate&&!validDate(externalDate))return fail('INVALID_DATE');
  let requested='';
  if(dateWord){
    if(/^\d/.test(dateWord)){if(!validDate(dateWord))return fail('INVALID_DATE');requested=dateWord;}
    else{
      const instant=new Date(String(updated||''));
      if(!Number.isFinite(instant.getTime()))return fail('DATE_REFERENCE_MISSING');
      const base=formatFamilyDateTime(instant,timeZone).slice(0,10);
      const days=({'今日':0,'明日':1,'明後日':2} as Record<string,number>)[dateWord];
      requested=new Date(Date.parse(base+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
    }
  }
  if(requested&&externalDate&&requested!==externalDate)return fail('DATE_CONFLICT');
  result.date=requested||externalDate||null;
  return result;
}

/** One D1 transaction owns the claim, parent/tasks, children and assignees together.
 * Parent task visibility is the canonical privacy boundary used by item-api/shopping-root.
 * At most ten statements per routed input; the caller retains its three-item page cap.
 */
export async function applyChecklistRoute(env:Env,a:Row,item:any):Promise<'not-handled'|'noop'|'review'|'command'>{
  if(!item?.id)return 'not-handled';
  const key=[a.id,String(a.tasklist_id||''),String(item.id)];
  const old=await env.DB.prepare('SELECT status,etag FROM google_tasks_routes WHERE account_id=? AND list_id=? AND external_id=? AND family_id=? AND member_id=?').bind(...key,a.family_id,a.member_id).first<Row>();
  if(old&&(old.status==='EXECUTED'||old.etag===String(item.etag||'')))return 'noop';
  if(item.deleted||item.status==='completed')return old?'noop':'not-handled';
  // Avoid extra auth/legacy reads for ordinary titles, while still recognizing prior routed IDs.
  if(!/(?:タスク|買い物|持ち物|を買って)/.test(String(item.title||'')))return old?'review':'not-handled';
  const owner=await env.DB.prepare("SELECT f.timezone,a.import_visibility FROM external_google_task_accounts a JOIN members m ON m.id=a.member_id AND m.family_id=a.family_id JOIN families f ON f.id=a.family_id WHERE a.id=? AND a.family_id=? AND a.member_id=? AND a.tasklist_id=? AND a.status IN ('ACTIVE','SYNCING','ERROR') AND m.active=1 AND m.deleted_at IS NULL").bind(a.id,a.family_id,a.member_id,a.tasklist_id).first<Row>();
  if(!owner)return 'noop';
  const route=parseChecklistRoute(item.title,item.due,item.updated,String(owner.timezone||'Asia/Tokyo'));
  if(!route)return old?'review':'not-handled';
  // Never convert a task/command that the pre-existing importer already owns.
  const legacy=await env.DB.prepare('SELECT 1 found FROM external_google_task_links WHERE account_id=? AND external_tasklist_id=? AND external_task_id=? UNION ALL SELECT 1 FROM external_google_voice_commands WHERE account_id=? AND external_tasklist_id=? AND external_task_id=? LIMIT 1').bind(...key,...key).first();
  if(legacy)return 'not-handled';
  const claim=crypto.randomUUID(),n=utcNow(),local=formatFamilyDateTime(new Date(),String(owner.timezone||'Asia/Tokyo'));
  const visibility=owner.import_visibility==='FAMILY'?'FAMILY':'PRIVATE';
  const gate='SELECT id FROM google_tasks_routes WHERE account_id=? AND list_id=? AND external_id=? AND claim=? AND status=\'PENDING\'';
  const gateArgs=[...key,claim];
  const statements=[env.DB.prepare("INSERT INTO google_tasks_routes(account_id,family_id,member_id,list_id,external_id,etag,kind,status,reason,claim,item_count,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM external_google_task_accounts a JOIN members m ON m.id=a.member_id AND m.family_id=a.family_id WHERE a.id=? AND a.family_id=? AND a.member_id=? AND a.tasklist_id=? AND a.status IN ('ACTIVE','SYNCING','ERROR') AND m.active=1 AND m.deleted_at IS NULL AND (CASE WHEN a.import_visibility='FAMILY' THEN 'FAMILY' ELSE 'PRIVATE' END)=?) ON CONFLICT(account_id,list_id,external_id) DO UPDATE SET etag=excluded.etag,kind=excluded.kind,status=excluded.status,reason=excluded.reason,claim=excluded.claim,item_count=excluded.item_count,updated_at=excluded.updated_at WHERE google_tasks_routes.status='NEEDS_REVIEW'").bind(a.id,a.family_id,a.member_id,a.tasklist_id,String(item.id),String(item.etag||''),route.kind,route.reason?'NEEDS_REVIEW':'PENDING',route.reason,claim,route.names.length,n,n,a.id,a.family_id,a.member_id,a.tasklist_id,visibility)];
  if(!route.reason){
    const dueAt=route.date?route.date+' 00:00:00':null;
    const parentTitle=(route.date?route.date+' ':'')+(route.kind==='SHOPPING'?'買い物':'持ち物');
    const taskNames=route.kind==='TASK'?route.names:[parentTitle];
    statements.push(env.DB.prepare(`INSERT INTO tasks(family_id,title,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,calendar_visible,task_kind,all_day,visibility_scope,private_owner_id,google_tasks_route_id) SELECT ?,j.value,?,'pending','ANY',?,?,?, ?,NULL,0,'TASK',1,?,?,r.id FROM google_tasks_routes r,json_each(?) j WHERE r.id IN (${gate})`).bind(a.family_id,dueAt,a.member_id,local,local,dueAt,visibility,visibility==='PRIVATE'?a.member_id:null,JSON.stringify(taskNames),...gateArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT id,? FROM tasks WHERE google_tasks_route_id IN (${gate})`).bind(a.member_id,...gateArgs));
    if(route.kind==='SHOPPING'){
      statements.push(env.DB.prepare(`INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) SELECT ?,j.value,'1',NULL,?,'pending',?,?,?,t.id,NULL FROM tasks t,json_each(?) j WHERE t.google_tasks_route_id IN (${gate})`).bind(a.family_id,route.date,a.member_id,local,local,JSON.stringify(route.names),...gateArgs));
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT s.id,? FROM shopping_items s JOIN tasks t ON t.id=s.task_id WHERE t.google_tasks_route_id IN (${gate})`).bind(a.member_id,...gateArgs));
    }else if(route.kind==='ITEM'){
      statements.push(env.DB.prepare(`INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id) SELECT ?,j.value,NULL,?,'pending','ANY',?,?,?,t.id FROM tasks t,json_each(?) j WHERE t.google_tasks_route_id IN (${gate})`).bind(a.family_id,dueAt,a.member_id,local,local,JSON.stringify(route.names),...gateArgs));
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT i.id,? FROM items i JOIN tasks t ON t.id=i.task_id WHERE t.google_tasks_route_id IN (${gate})`).bind(a.member_id,...gateArgs));
    }
    statements.push(env.DB.prepare(`UPDATE google_tasks_routes SET status='EXECUTED' WHERE id IN (${gate})`).bind(...gateArgs));
  }
  const results=await env.DB.batch(statements);
  if(!results[0].meta.changes)return 'noop';
  return route.reason?'review':'command';
}
