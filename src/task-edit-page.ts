import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { archiveItemCompletionStatements, archiveShoppingCompletionStatements } from './lifecycle';
import { validateLiffNext } from './liff-target';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { buildStoredTaskRange } from './task-range-safety';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;

const esc=(value:unknown)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');
const bad=(message:string)=>json({ok:false,error:message,code:'BAD_REQUEST'},400);
const forbidden=(message:string)=>json({ok:false,error:message,code:'FORBIDDEN'},403);

function authRequiredResponse(ctx:AppContext):Response{
  const url=new URL(ctx.request.url);
  const next=validateLiffNext(url.pathname+url.search);
  return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');
}

async function requireBody(request:Request):Promise<Record<string,unknown>|Response>{
  try{return await bodyJson(request);}
  catch(error){
    if(error instanceof RequestBodyParseError)return bad(error.message||'入力内容が不正です。');
    throw error;
  }
}

function csrfResponse(ctx:AppContext,token:unknown):Response|null{
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof token!=='string'||token!==ctx.session.csrfToken)return forbidden('CSRF検証に失敗しました。');
  return null;
}

function truthy(value:unknown,fallback=false):boolean{
  if(value===undefined||value===null||value==='')return fallback;
  if(typeof value==='boolean')return value;
  return ['1','true','on','yes'].includes(String(value).toLowerCase());
}

async function accessibleTaskById(ctx:AppContext,id:number):Promise<Row|null>{
  const member=ctx.member;
  if(!member)return null;
  return await ctx.env.DB.prepare(`SELECT t.* FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`)
    .bind(id,member.family_id,member.id).first<Row>()??null;
}

/** Canonical task/event-edit page retained independently from the legacy app.ts monolith. */
export async function taskEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);
  const task=await accessibleTaskById(ctx,id);
  if(!task)return new Response('タスクが見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase();
  if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return new Response('編集権限がありません。',{status:403});

  const [members,shops,items,categories]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name,quantity,url,category,status FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id').bind(id,m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name,status FROM items WHERE task_id=? AND family_id=? ORDER BY id').bind(id,m.family_id).all<Row>(),
    ctx.env.DB.prepare(`SELECT DISTINCT s.category FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} AND s.category IS NOT NULL AND s.category<>'' ORDER BY s.category`).bind(m.family_id,m.id).all<Row>(),
  ]);

  if(request.method==='POST'){
    const parsed=await requireBody(request);
    if(parsed instanceof Response)return parsed;
    const b=parsed;
    const rawShoppingCategories=Array.isArray(b.shopping)?(b.shopping as unknown[]).slice(0,50):[];
    for(const rawShopping of rawShoppingCategories){
      const raw=rawShopping as Record<string,unknown>|null;
      if(raw&&typeof raw==='object'&&Object.prototype.hasOwnProperty.call(raw,'category')&&String(raw.category||'').trim().length>255)return bad('カテゴリーは255文字以内で入力してください。');
    }
    if(String(b.shopping_category||'').trim().length>255)return bad('カテゴリーは255文字以内で入力してください。');
    const csrfFailure=csrfResponse(ctx,b.csrf);
    if(csrfFailure)return csrfFailure;

    const title=String(b.title||'').trim();
    const isEvent=Boolean(b.is_event);
    const makePrivate=truthy(b.visibility_scope==='PRIVATE'||b.is_private,false);
    if(makePrivate&&Number(task.created_by)!==m.id&&!(String(task.visibility_scope)==='PRIVATE'&&Number(task.private_owner_id)===m.id))return forbidden('他のメンバーが作成した共有タスクを自分専用にはできません。');
    const date=String(b.date||'').trim();
    const noDate=!isEvent&&(Boolean(b.no_date)||date==='');
    if(!title)return bad('タイトルを入力してください。');
    if(isEvent&&!date)return bad('イベントには日付を指定してください。');
    const endDate=String(b.end_date||date).trim();
    const startTime=String(b.start_time||'').trim();
    const endTime=String(b.end_time||'').trim();
    const allDayRequested=b.all_day===true||String(b.all_day)==='1'||String(b.all_day)==='on';
    const range=buildStoredTaskRange({noDate,allDay:allDayRequested,startDate:date,endDate,startTime,endTime,requireTimedStart:!allDayRequested});
    if(!range.ok){
      if(range.error==='START_DATE_INVALID')return bad('日付が不正です。');
      if(range.error==='END_DATE_INVALID')return bad('終了日が不正です。');
      if(range.error==='DATE_ORDER')return bad('終了日は開始日以降にしてください。');
      if(range.error==='START_TIME_REQUIRED')return bad('開始時刻を入力してください。');
      if(range.error==='START_TIME_INVALID')return bad('開始時刻が不正です。');
      if(range.error==='END_TIME_INVALID')return bad('終了時刻が不正です。');
      return bad('終了時刻は開始時刻以降にしてください。');
    }
    const start=range.startAt,end=range.endAt;
    const reminderRaw=String(b.reminder_at||'').trim();
    const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
    if(reminderRaw&&!reminderAt)return bad('通知日時が不正です。');
    const now=nowJst();
    if(reminderAt&&reminderAt<=now)return bad('通知日時は現在より後の日時を指定してください。');
    const calendarVisible=b.calendar_visible===false||String(b.calendar_visible)==='0'?0:1;
    const allDay=allDayRequested?1:0;
    const allowedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
    const calendarColor=allowedColors.includes(String(b.calendar_color||''))?String(b.calendar_color):String(task.calendar_color||'#7c3aed');

    const shopping=Array.isArray(b.shopping)?(b.shopping as unknown[]).slice(0,50):[];
    const itemsIn=Array.isArray(b.items)?(b.items as unknown[]).slice(0,50):[];
    const validUrl=(url:string)=>{if(!url)return true;try{const parsedUrl=new URL(url);return parsedUrl.protocol==='http:'||parsedUrl.protocol==='https:';}catch{return false;}};
    for(const value of shopping){const url=String((value as Record<string,unknown>)?.url||'').trim();if(!validUrl(url))return bad('買い物URLが不正です。');}

    await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id).run();
    const becamePrivate=makePrivate&&String(task.visibility_scope||'FAMILY')!=='PRIVATE';
    if(becamePrivate){
      await ctx.env.DB.prepare(`DELETE FROM activity_logs WHERE family_id=? AND ((target_type='task' AND target_id=?) OR (target_type='item' AND target_id IN (SELECT id FROM items WHERE family_id=? AND task_id=?)) OR (target_type='shopping' AND target_id IN (SELECT id FROM shopping_items WHERE family_id=? AND task_id=?)))`).bind(m.family_id,id,m.family_id,id,m.family_id,id).run();
    }
    await ctx.env.DB.prepare("UPDATE tasks SET title=?,description=?,due_at=?,start_at=?,end_at=?,location=?,reminder_at=?,calendar_visible=?,all_day=?,calendar_color=?,task_kind=?,visibility_scope=?,private_owner_id=?,completion_mode=CASE WHEN ?='PRIVATE' THEN 'ANY' ELSE completion_mode END,status=CASE WHEN ?=1 THEN 'pending' ELSE status END,completed_by=CASE WHEN ?=1 THEN NULL ELSE completed_by END,completed_at=CASE WHEN ?=1 THEN NULL ELSE completed_at END,updated_at=? WHERE id=? AND family_id=?")
      .bind(title,String(b.description||'')||null,noDate?null:(end||start||`${date} 00:00:00`),start,end,String(b.location||'')||null,reminderAt,calendarVisible,allDay,calendarColor,isEvent?'EVENT':'TASK',makePrivate?'PRIVATE':'FAMILY',makePrivate?m.id:null,makePrivate?'PRIVATE':'FAMILY',isEvent?1:0,isEvent?1:0,isEvent?1:0,now,id,m.family_id).run();
    if(isEvent)await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?').bind(id).run();

    const assignees=makePrivate?[m.id]:(Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(memberId=>memberId>0):[]);
    await ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id).run();
    if(assignees.length)await ctx.env.DB.batch(assignees.map(memberId=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,memberId,m.family_id)));
    await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT member_id FROM task_assignees WHERE task_id=?)').bind(id,id).run();

    const linkedShopsForAssignees=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all<Row>();
    const linkedItemsForAssignees=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all<Row>();
    const syncStatements:any[]=[];
    for(const row of linkedShopsForAssignees.results){
      syncStatements.push(ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(Number(row.id)));
      if(assignees.length)for(const memberId of assignees)syncStatements.push(ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(Number(row.id),memberId,m.family_id));
    }
    for(const row of linkedItemsForAssignees.results){
      syncStatements.push(ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(Number(row.id)));
      if(assignees.length)for(const memberId of assignees)syncStatements.push(ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(Number(row.id),memberId,m.family_id));
    }
    if(syncStatements.length)await ctx.env.DB.batch(syncStatements);
    if(linkedShopsForAssignees.results.length){
      await ctx.env.DB.batch(linkedShopsForAssignees.results.map(row=>ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN (SELECT member_id FROM shopping_assignees WHERE shopping_item_id=?)').bind(Number(row.id),Number(row.id))));
      await ctx.env.DB.prepare("UPDATE shopping_items SET status=CASE WHEN (SELECT COUNT(*) FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=shopping_items.id)=0 THEN 'pending' WHEN (SELECT COUNT(*) FROM shopping_completions sc JOIN shopping_assignees sa ON sa.shopping_item_id=sc.shopping_item_id AND sa.member_id=sc.member_id JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sc.shopping_item_id=shopping_items.id) > 0 THEN 'completed' ELSE 'pending' END, updated_at=? WHERE task_id=? AND family_id=?").bind(now,id,m.family_id).run();
    }
    if(linkedItemsForAssignees.results.length){
      await ctx.env.DB.batch(linkedItemsForAssignees.results.map(row=>ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=? AND member_id NOT IN (SELECT member_id FROM item_assignees WHERE item_id=?)').bind(Number(row.id),Number(row.id))));
      await ctx.env.DB.prepare("UPDATE items SET status=CASE WHEN (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id)=0 THEN 'pending' WHEN completion_mode='ALL' AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id) >= (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id) THEN 'completed' WHEN completion_mode<>'ALL' AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id) > 0 THEN 'completed' ELSE 'pending' END, updated_at=? WHERE task_id=? AND family_id=?").bind(now,id,m.family_id).run();
    }
    await ctx.env.DB.prepare("UPDATE tasks SET status=CASE WHEN (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id)=0 THEN 'pending' WHEN completion_mode='ALL' AND (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id) >= (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id) THEN 'completed' WHEN completion_mode<>'ALL' AND (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id) > 0 THEN 'completed' ELSE 'pending' END, updated_at=? WHERE id=? AND family_id=?").bind(now,id,m.family_id).run();

    if(reminderAt&&assignees.length){
      const recipients=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();
      if(recipients.results.length)await ctx.env.DB.batch(recipients.results.map(row=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(m.family_id,Number(row.id),'task_reminder','task',id,reminderAt,'pending',`【タスク】${title}\n${String(b.description||'').trim()||'詳細なし'}${start?'\n予定: '+start.slice(0,16):''}${end?' ～ '+end.slice(11,16):''}${String(b.location||'').trim()?'\n場所: '+String(b.location).trim():''}`,now)));
    }

    const existingShopIds=new Set(shops.results.map(row=>Number(row.id)));
    const existingShopCategoryById=new Map(shops.results.map(row=>[Number(row.id),String(row.category||'').trim()||null]));
    const postedShopIds=new Set<number>();
    const fallbackCategory=String(b.shopping_category||'').trim()||null;
    for(const value of shopping){
      const row=value as Record<string,unknown>;
      const name=String(row?.name||'').trim();
      if(!name)continue;
      const quantity=String(row?.quantity||'1').trim()||'1';
      const url=String(row?.url||'').trim()||null;
      const shoppingId=Number(row?.id||0);
      const rawCategory=Object.prototype.hasOwnProperty.call(row,'category')?String(row.category||'').trim():(existingShopCategoryById.get(shoppingId)||fallbackCategory||'');
      if(rawCategory.length>255)return bad('カテゴリーは255文字以内で入力してください。');
      const category=rawCategory||null;
      if(shoppingId&&existingShopIds.has(shoppingId)){
        postedShopIds.add(shoppingId);
        await ctx.env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,url=?,category=?,updated_at=? WHERE id=? AND task_id=? AND family_id=?').bind(name,quantity,url,category,now,shoppingId,id,m.family_id).run();
      }else{
        const created=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)")
          .bind(m.family_id,name,quantity,category,null,noDate?null:date,m.id,now,now,id,url).run();
        const shoppingId2=Number(created.meta.last_row_id);
        if(assignees.length)await ctx.env.DB.batch(assignees.map(memberId=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(shoppingId2,memberId,m.family_id)));
      }
    }
    for(const row of shops.results){
      const shoppingId=Number(row.id);
      if(postedShopIds.has(shoppingId))continue;
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(shoppingId),
        ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,shoppingId,now),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND task_id=? AND family_id=?').bind(shoppingId,id,m.family_id),
      ]);
    }

    const existingItemIds=new Set(items.results.map(row=>Number(row.id)));
    const postedItemIds=new Set<number>();
    for(const value of itemsIn){
      const row=value as Record<string,unknown>;
      const name=String(row?.name||'').trim();
      if(!name)continue;
      const itemId=Number(row?.id||0);
      if(itemId&&existingItemIds.has(itemId)){
        postedItemIds.add(itemId);
        await ctx.env.DB.prepare('UPDATE items SET name=?,due_at=?,updated_at=? WHERE id=? AND task_id=? AND family_id=?').bind(name,noDate?null:`${date} 00:00:00`,now,itemId,id,m.family_id).run();
      }else{
        const created=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?)")
          .bind(m.family_id,name,null,noDate?null:`${date} 00:00:00`,m.id,now,now,id,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();
        const itemId2=Number(created.meta.last_row_id);
        if(assignees.length)await ctx.env.DB.batch(assignees.map(memberId=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(itemId2,memberId,m.family_id)));
      }
    }
    for(const row of items.results){
      const itemId=Number(row.id);
      if(postedItemIds.has(itemId))continue;
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(itemId),
        ...archiveItemCompletionStatements(ctx.env.DB,m.family_id,itemId,now),
        ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND task_id=? AND family_id=?').bind(itemId,id,m.family_id),
      ]);
    }

    try{await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id);}catch{/* task save succeeds independently of Google */}
    return redirect(`/task/view.php?id=${id}`);
  }

  const date=String(task.start_at||task.due_at||'').slice(0,10);
  const noDate=!task.start_at&&!task.due_at;
  const startTime=task.start_at?String(task.start_at).slice(11,16):'';
  const endTime=task.end_at?String(task.end_at).slice(11,16):'';
  const selected=new Set((await ctx.env.DB.prepare('SELECT member_id FROM task_assignees WHERE task_id=?').bind(id).all<Row>()).results.map(row=>Number(row.member_id)));
  const safe=(value:unknown)=>esc(String(value??''));
  const shopRows=shops.results.map(row=>`<div class="product-row task-child-row"><input type="hidden" name="shopping_id[]" value="${row.id}"><input name="shopping_name[]" value="${safe(row.name)}" placeholder="商品名"><input name="shopping_quantity[]" value="${safe(row.quantity||'1')}" placeholder="数量"><input name="shopping_category[]" value="${safe(row.category||'')}" list="taskShopCategories" maxlength="255" placeholder="カテゴリー"><input type="url" name="shopping_url[]" value="${safe(row.url||'')}" placeholder="URL（任意）"><button type="button" class="btn gray small remove-child">×</button></div>`).join('');
  const itemRows=items.results.map(row=>`<div class="item-entry task-child-row"><input type="hidden" name="item_id[]" value="${row.id}"><input name="item_name[]" value="${safe(row.name)}" placeholder="持ち物名"><button type="button" class="btn gray small remove-child">×</button></div>`).join('');
  const body=`<div class="card form-card"><h1>📝 タスク・イベント編集</h1><form id="taskEditForm" class="compact-form">
    <input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}">
    <label>タイトル</label><input name="title" required value="${safe(task.title)}"><label class="checkrow"><input id="editIsEvent" type="checkbox" name="is_event" ${String(task.task_kind||'').toLowerCase()==='event'?'checked':''}><span>イベントとして登録（チェック・期限切れ対象なし）</span></label>
    <label>日付</label><div class="date-option-row date-range-grid"><div><span class="small">開始日</span><input id="editTaskDate" type="date" name="date" value="${safe(date)}"></div><div><span class="small">終了日</span><input id="editTaskEndDate" type="date" name="end_date" value="${safe(String(task.end_at||task.start_at||task.due_at||'').slice(0,10))}"></div><label class="checkrow"><input id="editNoDate" type="checkbox" name="no_date" ${noDate?'checked':''}> <span>期限なし（未整理）</span></label></div>
    <div id="editTimeFields" class="task-time-fields"><div class="field-block"><label>開始時刻</label><input type="time" name="start_time" value="${safe(startTime)}"></div><div class="field-block"><label>終了時刻</label><input type="time" name="end_time" value="${safe(endTime)}"></div></div>
    <label>場所</label><input name="location" value="${safe(task.location||'')}">
    <label>説明</label><textarea name="description">${safe(task.description||'')}</textarea><label class="checkrow"><input id="editIsPrivate" type="checkbox" name="is_private" ${String(task.visibility_scope||'FAMILY')==='PRIVATE'?'checked':''}><span>🔒 自分専用</span></label><p class="small">他の家族にはタスク・カレンダー・詳細を表示しません</p>
    <label class="checkrow"><input id="editAllDay" type="checkbox" name="all_day" ${Number(task.all_day??0)?'checked':''}> 終日</label>
    <label class="checkrow"><input id="editCalendarVisible" type="checkbox" name="calendar_visible" ${Number(task.calendar_visible??1)?'checked':''}> カレンダーに表示</label><div id="editCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color">${task.calendar_color&&!['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'].includes(String(task.calendar_color))?`<option value="${safe(task.calendar_color)}" selected>インポート色 ${safe(task.calendar_color)}</option>`:''}<option value="#7c3aed" ${String(task.calendar_color||'#7c3aed')==='#7c3aed'?'selected':''}>紫</option><option value="#2563eb" ${String(task.calendar_color||'')==='#2563eb'?'selected':''}>青</option><option value="#16a34a" ${String(task.calendar_color||'')==='#16a34a'?'selected':''}>緑</option><option value="#ea580c" ${String(task.calendar_color||'')==='#ea580c'?'selected':''}>橙</option><option value="#dc2626" ${String(task.calendar_color||'')==='#dc2626'?'selected':''}>赤</option><option value="#db2777" ${String(task.calendar_color||'')==='#db2777'?'selected':''}>ピンク</option><option value="#0891b2" ${String(task.calendar_color||'')==='#0891b2'?'selected':''}>水色</option><option value="#64748b" ${String(task.calendar_color||'')==='#64748b'?'selected':''}>灰</option></select></div>
    <label>担当者</label><div class="assignee-list">${members.results.map(member=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${member.id}" ${selected.has(Number(member.id))?'checked':''}> ${safe(member.name)}</label>`).join('')}</div>
    <label>通知日時（任意）</label><input type="datetime-local" name="reminder_at" value="${safe(task.reminder_at?String(task.reminder_at).slice(0,16).replace(' ','T'):'')}"><p class="small">設定すると担当者へ指定日時に詳細を設定した通知方法で通知します。</p>
    <div class="sub-card"><button type="button" class="section-button" id="shopToggle">🛒 買い物を編集</button><div id="shopBox" ${shops.results.length?'':'style="display:none"'}><datalist id="taskShopCategories">${categories.results.map(category=>`<option value="${safe(category.category)}">`).join('')}</datalist><div id="shopRows">${shopRows||`<div class="product-row task-child-row"><input type="hidden" name="shopping_id[]" value="0"><input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input name="shopping_category[]" list="taskShopCategories" maxlength="255" placeholder="カテゴリー"><input type="url" name="shopping_url[]" placeholder="URL（任意）"><button type="button" class="btn gray small remove-child">×</button></div>`}</div><button type="button" class="btn gray small" id="addShopRow">＋ 商品を追加</button></div></div>
    <div class="sub-card"><button type="button" class="section-button" id="itemToggle">🎒 持ち物を編集</button><div id="itemBox" ${items.results.length?'':'style="display:none"'}><div id="itemRows">${itemRows||`<div class="item-entry task-child-row"><input type="hidden" name="item_id[]" value="0"><input name="item_name[]" placeholder="持ち物名"><button type="button" class="btn gray small remove-child">×</button></div>`}</div><button type="button" class="btn gray small" id="addItemRow">＋ 持ち物を追加</button></div></div>
    <button type="submit">保存する</button></form><p><a class="btn gray" href="/task/view.php?id=${id}">戻る</a></p></div>
    <script src="/assets/task-edit.js?v=${APP_VERSION}"></script>`;
  return html(layout('タスク・イベント編集',body,''));
}
