import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';
import { commitSession } from './session';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const bad=(message:string)=>json({ok:false,error:message,code:'BAD_REQUEST'},400);

async function requireBody(request:Request):Promise<Record<string,unknown>|Response>{
  try{return await bodyJson(request);}
  catch(error){
    if(error instanceof RequestBodyParseError)return bad(error.message||'入力内容が不正です。');
    throw error;
  }
}

function csrfResponse(ctx:AppContext,token:unknown):Response|null{
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof token!=='string'||token!==ctx.session.csrfToken)return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);
  return null;
}

async function privateParentOwner(ctx:AppContext,taskId:number|null):Promise<{ownerId:number|null;error?:Response}>{
  if(!taskId)return {ownerId:null};
  const m=ctx.member!;
  const task=await ctx.env.DB.prepare(`SELECT t.visibility_scope,t.private_owner_id FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(taskId,m.family_id,m.id).first<Row>();
  if(!task)return {ownerId:null,error:bad('関連タスクが見つかりません。')};
  return {ownerId:String(task.visibility_scope)==='PRIVATE'?Number(task.private_owner_id):null};
}

async function forcePrivateShoppingAssignee(ctx:AppContext,shoppingId:number,ownerId:number|null):Promise<void>{
  if(!ownerId)return;
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(shoppingId),
    ctx.env.DB.prepare('INSERT INTO shopping_assignees(shopping_item_id,member_id) VALUES(?,?)').bind(shoppingId,ownerId),
  ]);
}

/** Canonical Shopping mutation API. The retired standalone list page is not rendered here. */
export async function shopping(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
  if(request.method!=='POST')return json({ok:false,error:'Method Not Allowed',code:'METHOD_NOT_ALLOWED'},405);

  const parsed=await requireBody(request);
  if(parsed instanceof Response)return parsed;
  const b=parsed;
  const csrfFailure=csrfResponse(ctx,b.csrf);
  if(csrfFailure)return csrfFailure;
  const action=String(b.action??'add');

  if(action==='to_task'){
    const id=Number(b.id||0);
    const item=await ctx.env.DB.prepare(`SELECT s.* FROM shopping_items s WHERE s.id=? AND s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${taskVisibilitySql('t')})) LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
    if(!item)return json({ok:false,error:'買い物項目が見つかりません。'},404);
    const now=nowJst();
    const due=String(item.due_date||'').trim();
    const result=await ctx.env.DB.prepare("INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,task_kind,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)").bind(m.family_id,String(item.name||''),'買い物から作成',due?`${due} 00:00:00`:null,'pending','ANY',m.id,now,now,due?`${due} 00:00:00`:null,null,null,due?1:0,1,'task').run();
    const taskId=Number(result.meta.last_row_id);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE shopping_items SET task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,id,m.family_id),
      ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,member_id FROM shopping_assignees WHERE shopping_item_id=?').bind(taskId,id),
    ]);
    try{await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,taskId);}catch{/* local mutation remains authoritative */}
    return commitSession(json({ok:true,id:taskId}),ctx.session,ctx.env.APP_SECRET);
  }

  if(action==='toggle'){
    const id=Number(b.id),completed=Boolean(b.completed),now=nowJst();
    const current=await ctx.env.DB.prepare(`SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=? AND ${taskChildVisibilitySql('s')}`).bind(id,m.family_id,m.id).first<Row>();
    if(!current)return json({ok:false,error:'買い物が見つかりません。'},404);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE shopping_items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(completed?'completed':'pending',completed?m.id:null,completed?now:null,now,id,m.family_id),
      ctx.env.DB.prepare('INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now),
    ]);
    return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
  }

  if(action==='add_batch'){
    const products=Array.isArray(b.products)?b.products as unknown[]:[];
    const normalized=products.map(v=>({name:String((v as any)?.name??'').trim(),quantity:String((v as any)?.quantity??'1').trim()||'1',url:String((v as any)?.url??'').trim()})).filter(v=>v.name);
    if(!normalized.length)return bad('商品名を1つ以上入力してください。');
    if(normalized.length>50)return bad('一度に登録できる商品は50件までです。');
    for(const p of normalized){if(p.url){try{const u=new URL(p.url);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{return bad('商品URLが不正です。');}}}
    const category=String(b.category??'').trim()||null;
    const memo=String(b.memo??'').trim()||null;
    let due=String(b.due_date??'').trim()||null;
    if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return bad('期限の日付が不正です。');
    const taskId=Number(b.task_id??0)||null;
    if(taskId){
      const task=await ctx.env.DB.prepare(`SELECT t.id,t.start_at,t.due_at FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first<Row>();
      if(!task)return bad('関連タスクが見つかりません。');
      if(!due)due=String(task.start_at||task.due_at||'').slice(0,10)||null;
    }
    const privateParent=await privateParentOwner(ctx,taskId);
    if(privateParent.error)return privateParent.error;
    const now=nowJst();
    const statements=normalized.map(p=>ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,p.name,p.quantity,category,memo,due,m.id,now,now,taskId,p.url||null));
    const result=await ctx.env.DB.batch(statements);
    const assignees=privateParent.ownerId?[privateParent.ownerId]:(Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[]);
    if(assignees.length){
      const ids=result.map((r:any)=>Number(r.meta?.last_row_id||0)).filter(Boolean);
      for(const shoppingId of ids)await ctx.env.DB.batch(assignees.map(memberId=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(shoppingId,memberId,m.family_id)));
    }
    return commitSession(json({ok:true,count:normalized.length}),ctx.session,ctx.env.APP_SECRET);
  }

  if(action==='add'){
    const name=String(b.name??'').trim();
    if(!name)return bad('商品名を入力してください。');
    const quantity=String(b.quantity??'1').trim()||'1';
    const category=String(b.category??'').trim()||null;
    const memo=String(b.memo??'').trim()||null;
    let due=String(b.due_date??'').trim()||null;
    if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return bad('期限の日付が不正です。');
    const taskId=Number(b.task_id??0)||null;
    if(taskId){
      const task=await ctx.env.DB.prepare(`SELECT t.start_at,t.due_at FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first<Row>();
      if(!task)return bad('関連タスクが見つかりません。');
      if(!due)due=String(task.start_at||task.due_at||'').slice(0,10)||null;
    }
    const rawUrl=String(b.url??'').trim();
    if(rawUrl){try{const u=new URL(rawUrl);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{return bad('商品URLが不正です。');}}
    const now=nowJst();
    const created=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,quantity,category,memo,due,m.id,now,now,taskId,rawUrl||null).run();
    const privateParent=await privateParentOwner(ctx,taskId);
    if(privateParent.error)return privateParent.error;
    await forcePrivateShoppingAssignee(ctx,Number(created.meta.last_row_id),privateParent.ownerId);
    return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
  }

  return bad('未対応の操作です。');
}
