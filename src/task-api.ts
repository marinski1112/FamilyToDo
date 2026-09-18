import { json } from './response';
import { taskVisibilitySql } from './task-visibility';
import { validateTaskParentLink } from './task-hierarchy';
import { normalizeCalendarColor } from './calendar-colors';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements } from './lifecycle';
import { queueCalendarProjectionAfterMutation, wakeCalendarOutbox } from './google-calendar';
import { buildStoredTaskRange } from './task-range-safety';
import { normalizeTaskCreateKey } from './task-create-idempotency';
import { createTaskIdempotently, type TaskCreateShoppingInput } from './task-create';

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
  const parentRaw=b.parent_task_id;
  const parentTaskId=parentRaw===undefined||parentRaw===null||String(parentRaw).trim()===''?null:Number(parentRaw);
  if(parentTaskId!==null&&(!Number.isInteger(parentTaskId)||parentTaskId<=0))return json({ok:false,error:'親タスクが不正です。'},400);
  if(parentTaskId!==null&&isEvent)return json({ok:false,error:'子タスクはタスクとして作成してください。'},400);
  if(parentTaskId!==null){
    const parent=await ctx.env.DB.prepare(`SELECT id,family_id,parent_task_id,visibility_scope,private_owner_id FROM tasks t WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(parentTaskId,m.family_id,m.id).first();
    if(!parent)return json({ok:false,error:'親タスクが見つかりません。'},404);
    const link=validateTaskParentLink(
      {id:0,familyId:Number(m.family_id),parentTaskId:null,hasChildren:false,visibilityScope:isPrivate?'PRIVATE':'FAMILY',privateOwnerId:isPrivate?Number(m.id):null},
      {id:Number(parent.id),familyId:Number(parent.family_id),parentTaskId:parent.parent_task_id===null?null:Number(parent.parent_task_id),hasChildren:false,visibilityScope:String(parent.visibility_scope)==='PRIVATE'?'PRIVATE':'FAMILY',privateOwnerId:parent.private_owner_id===null?null:Number(parent.private_owner_id)},
    );
    if(!link.ok)return json({ok:false,error:link.reason==='MAX_DEPTH'?'子タスクの下に子タスクは作成できません。':'親タスクと公開範囲が一致しません。'},400);
  }
  const calendarColor=normalizeCalendarColor(b.calendar_color);
  const dueValue=noDate?null:(end||start||`${date} 00:00:00`);
  const ids=(isPrivate?[m.id]:[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))]).sort((a,b)=>a-b);
  if(ids.length){
    const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(m.family_id,...ids).all();
    const validIds=new Set(valid.results.map((x:any)=>Number(x.id)));
    if(ids.some(id=>!validIds.has(id))) return json({ok:false,error:'担当者に無効なメンバーが含まれています。'},400);
  }

  const rawIdempotencyKey=String(request.headers.get('Idempotency-Key')||b.idempotency_key||'').trim();
  const suppliedIdempotencyKey=normalizeTaskCreateKey(rawIdempotencyKey);
  if(rawIdempotencyKey&&!suppliedIdempotencyKey)return json({ok:false,error:'登録キーが不正です。ページを再読み込みしてください。',code:'IDEMPOTENCY_KEY_INVALID'},400);
  // Compatibility for an already-open pre-upgrade page. Current clients always send a key.
  const idempotencyKey=suppliedIdempotencyKey||`legacy:${crypto.randomUUID()}`;
  const shopping:TaskCreateShoppingInput[]=shoppingPre.map(v=>{
    const name=String(v?.name||'').trim();
    const quantity=String(v?.quantity||'1').trim()||'1';
    const category=(Object.prototype.hasOwnProperty.call(v||{},'category')?String(v?.category??'').trim():legacyShoppingCategory)||null;
    const url=String(v?.url||'').trim()||null;
    return {name,quantity,category,url};
  }).filter(v=>Boolean(v.name));
  const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):[];
  const result=await createTaskIdempotently(ctx.env.DB,{
    familyId:Number(m.family_id),memberId:Number(m.id),idempotencyKey,title,
    description:String(b.description??'')||null,dueValue,completionMode,start,end,
    location:String(b.location??'')||null,allDay,calendarVisible:calendarVisibleFlag(b),calendarColor,
    taskKind:isEvent?'EVENT':'TASK',reminderAt,visibilityScope:isPrivate?'PRIVATE':'FAMILY',
    privateOwnerId:isPrivate?Number(m.id):null,parentTaskId,assigneeIds:ids,shopping,
    shoppingDueDate:noDate?null:date,
    shoppingCatalogName:legacyShoppingCategory&&b.shopping_category==='__custom__'?legacyShoppingCategory:null,
    itemNames,itemDueAt:date?`${date} 00:00:00`:null,
  });
  if(result.state==='CONFLICT')return json({ok:false,error:'同じ登録キーが別の内容に使われています。ページを再読み込みしてください。',code:'IDEMPOTENCY_KEY_CONFLICT'},409);
  if(result.state==='GONE')return json({ok:false,error:'この登録キーで作成したタスクは既に削除されています。ページを再読み込みして新しく登録してください。',code:'IDEMPOTENCY_TARGET_DELETED'},409);
  if(result.state==='BUSY')return json({ok:false,error:'同じ登録処理が進行中です。少し待ってから再度お試しください。',code:'IDEMPOTENCY_IN_PROGRESS'},409);
  if(result.state==='LEASE_LOST')return json({ok:false,error:'登録処理の所有権が切り替わりました。保存結果を確認してから再度お試しください。',code:'IDEMPOTENCY_LEASE_LOST'},409);
  const id=result.taskId;
  try { await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); wakeCalendarOutbox(ctx,m.family_id); } catch { /* local task remains authoritative; replay repairs the projection queue */ }
  return json({ok:true,id,replayed:result.state==='REPLAY'},result.state==='REPLAY'?200:201);
}