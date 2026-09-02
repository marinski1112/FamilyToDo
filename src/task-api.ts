import { json } from './response';
import { taskVisibilitySql } from './task-visibility';
import { normalizeCalendarColor } from './calendar-colors';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements } from './lifecycle';
import { queueCalendarProjectionAfterMutation, wakeCalendarOutbox } from './google-calendar';
import { buildStoredTaskRange } from './task-range-safety';
import { logTaskCreationCleanupFailure } from './observability/errors';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');
function calendarVisibleFlag(b: Record<string, unknown>): number { return b.calendar_visible===false || String(b.calendar_visible)==='0' ? 0 : 1; }

export async function taskApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method==='DELETE'){
    const id=Number(new URL(request.url).searchParams.get('id')||0);
    const csrf=request.headers.get('x-csrf')||'';
    if(!id||csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'削除情報が不正です。'},403);
    const task=await ctx.env.DB.prepare(`SELECT created_by FROM tasks t WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')}`).bind(id,m.family_id,m.id).first();
    if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
    const role=String(m.role||'').toUpperCase();
    if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
    const now=nowJst();
    const shops=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const items=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const rules=await ctx.env.DB.prepare('SELECT id FROM recurrence_rules WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const q:any[]=[
      ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,id,m.family_id),
    ];
    for(const r of rules.results){
      q.push(
        ...archiveRecurrenceRuleOccurrenceStatements(ctx.env.DB,m.family_id,Number(r.id),now),
        ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id)
      );
    }
    for(const r of shops.results){
      const sid=Number(r.id);
      q.push(
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(sid),
        ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,sid,now),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(sid,m.family_id)
      );
    }
    for(const r of items.results){
      const iid=Number(r.id);
      q.push(
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(iid),
        ...archiveItemCompletionStatements(ctx.env.DB,m.family_id,iid,now),
        ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(iid,m.family_id)
      );
    }
    q.push(
      ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
      ...archiveTaskCompletionStatements(ctx.env.DB,m.family_id,id,now),
      ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id)
    );
    await ctx.env.DB.batch(q);
    try { await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); wakeCalendarOutbox(ctx,m.family_id); } catch { /* deletion remains authoritative */ }
    return json({ok:true});
  }
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await (async()=>{const v=await request.json().catch(()=>null);return v&&typeof v==='object'?v as Record<string,unknown>:null})();
  if(!b) return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const title=String(b.title??'').trim();const date=String(b.dateOnly??'').trim();const isEvent=Boolean(b.is_event);const noDate=!isEvent&&(Boolean(b.noDate)||date==='');
  if(!title)return json({ok:false,error:'タイトルを入力してください。'},400);
  if(isEvent&&!date)return json({ok:false,error:'イベントには日付を指定してください。'},400);
  const allDay=Boolean(b.allDay); const endDate=String(b.endDateOnly??date).trim(); const st=String(b.startTime??'').trim();const et=String(b.endTime??'').trim();
  const range=buildStoredTaskRange({noDate,allDay,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDay});
  if(!range.ok){
    const error=range.error==='START_DATE_INVALID'?'日付が不正です。':range.error==='END_DATE_INVALID'?'終了日が不正です。':range.error==='DATE_ORDER'?'終了日は開始日以降にしてください。':range.error==='START_TIME_REQUIRED'?'開始日時を指定してください。':range.error==='START_TIME_INVALID'?'開始日時が不正です。':range.error==='END_TIME_INVALID'?'終了日時が不正です。':'終了日時は開始日時以降にしてください。';
    return json({ok:false,error},400);
  }
  const start=range.startAt,end=range.endAt;
  const reminderRaw=String(b.reminderAt??'').trim();
  const reminderAt=reminderRaw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
  if(reminderRaw && !reminderAt)return json({ok:false,error:'通知日時が不正です。'},400);
  const shoppingPre=Array.isArray(b.shopping)?(b.shopping as any[]).slice(0,50):[];
  const legacyShoppingCategory=String(b.shopping_category==='__custom__'?b.shopping_category_custom:b.shopping_category||'').trim();
  if(legacyShoppingCategory.length>255)return json({ok:false,error:'買い物カテゴリーが長すぎます。'},400);
  for(const v of shoppingPre){
    const u=String(v?.url||'').trim();if(u){try{const parsed=new URL(u);if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{return json({ok:false,error:'買い物URLが不正です。'},400);}}
    if(Object.prototype.hasOwnProperty.call(v||{},'category')&&String(v?.category??'').trim().length>255)return json({ok:false,error:'買い物カテゴリーが長すぎます。'},400);
  }
  const now=nowJst();const isPrivate=(b.is_private===true||String(b.is_private)==='1'||String(b.visibility_scope)==='PRIVATE');const completionMode=isPrivate?'ANY':(String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY');
  const calendarColor=normalizeCalendarColor(b.calendar_color);
  const dueValue=noDate?null:(end||start||`${date} 00:00:00`);
  const ids=isPrivate?[m.id]:[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
  if(ids.length){
    const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(m.family_id,...ids).all();
    const validIds=new Set(valid.results.map((x:any)=>Number(x.id)));
    if(ids.some(id=>!validIds.has(id))) return json({ok:false,error:'担当者に無効なメンバーが含まれています。'},400);
  }
  let id=0;
  try {
    const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,visibility_scope,private_owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(m.family_id,title,String(b.description??'')||null,dueValue,'pending',completionMode,m.id,now,now,start,end,String(b.location??'')||null,allDay?1:0,calendarVisibleFlag(b),calendarColor,isEvent?'EVENT':'TASK',0,reminderAt,isPrivate?'PRIVATE':'FAMILY',isPrivate?m.id:null).run();
    id=Number(r.meta.last_row_id);
    if(ids.length) await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
    const now2=nowJst();
    const shopping=shoppingPre;
    if(shopping.length){
      if(legacyShoppingCategory && b.shopping_category==='__custom__') await ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_categories(family_id,name,created_at) VALUES(?,?,?)').bind(m.family_id,legacyShoppingCategory,now2).run().catch(()=>{});
      const dueDate=noDate?null:date; const group=crypto.randomUUID().replaceAll('-','').slice(0,16);
      for(const v of shopping.slice(0,50)){const name=String(v?.name||'').trim();if(!name)continue;const qty=String(v?.quantity||'1').trim()||'1';const category=(Object.prototype.hasOwnProperty.call(v||{},'category')?String(v?.category??'').trim():legacyShoppingCategory)||null;const url=String(v?.url||'').trim();const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,null,dueDate,m.id,now2,now2,id,url||null).run(); const sid=Number(sr.meta.last_row_id); if(ids.length) await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}
    }
    const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):[];
    if(itemNames.length){const group=crypto.randomUUID().replaceAll('-','').slice(0,16);for(const name of itemNames){const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,null,date?`${date} 00:00:00`:null,m.id,now2,now2,id,group).run();const iid=Number(ir.meta.last_row_id);if(ids.length)await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id)));}}
    if(reminderAt && ids.length){
      const recipients=await ctx.env.DB.prepare(`SELECT id,name FROM members WHERE family_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(m.family_id,...ids).all();
      if(recipients.results.length) await ctx.env.DB.batch(recipients.results.map((r:any)=>ctx.env.DB.prepare('INSERT INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(r.id),'task_reminder','task',id,reminderAt,'pending',`【タスク】${title}\n${String(b.description??'').trim()||'詳細なし'}${start?'\n予定: '+start.slice(0,16):''}${end?' ～ '+end.slice(11,16):''}${String(b.location??'').trim()?'\n場所: '+String(b.location).trim():''}`,now)));
    }
  } catch(e){
    if(id){
      try { await ctx.env.DB.batch([
        ctx.env.DB.prepare("DELETE FROM notifications WHERE family_id=? AND target_type='task' AND target_id=?").bind(m.family_id,id),
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
        ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id),
      ]); } catch(cleanup){ logTaskCreationCleanupFailure(cleanup); }
    }
    throw e;
  }

  try { await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); wakeCalendarOutbox(ctx,m.family_id); } catch { /* local task remains authoritative */ }
  if(!isPrivate)await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','task',id,JSON.stringify({title}),nowJst()).run().catch(()=>{});return json({ok:true,id},201);
}