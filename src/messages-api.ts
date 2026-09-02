import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { logActivity } from './activity-log';
import { normalizeCalendarColor } from './calendar-colors';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { commitSession } from './session';
import { buildStoredTaskRange } from './task-range-safety';
import { validateLiffNext } from './liff-target';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const bad=(message:string)=>json({ok:false,error:message,code:'BAD_REQUEST'},400);

function authRequiredResponse(ctx:AppContext):Response{
  const url=new URL(ctx.request.url);
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/app/api/'))return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
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
  if(typeof token!=='string'||token!==ctx.session.csrfToken)return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);
  return null;
}

/** Canonical messages page/API handler retained independently from the legacy app.ts monolith. */
export async function messages(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);

  if(request.method==='POST'){
    const parsed=await requireBody(request);
    if(parsed instanceof Response)return parsed;
    const b=parsed;
    const csrfFailure=csrfResponse(ctx,b.csrf);
    if(csrfFailure)return csrfFailure;
    const action=String(b.action||'create');
    const now=nowJst();

    if(action==='delete'){
      const id=Number(b.id||0);
      const msg=await ctx.env.DB.prepare('SELECT id,sender_id FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
      if(!msg)return json({ok:false,error:'伝言が見つかりません。'},404);
      const role=String(m.role||'').toUpperCase();
      if(Number(msg.sender_id)!==m.id&&role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'権限がありません。'},403);
      await ctx.env.DB.batch([
        ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='message' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM messages WHERE id=? AND family_id=?').bind(id,m.family_id),
      ]);
      await logActivity(ctx,'DELETED','message',id);
      return json({ok:true});
    }

    if(action==='edit'){
      const id=Number(b.id||0);
      const msg=await ctx.env.DB.prepare('SELECT id,sender_id FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
      if(!msg)return json({ok:false,error:'伝言が見つかりません。'},404);
      const role=String(m.role||'').toUpperCase();
      if(Number(msg.sender_id)!==m.id&&role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'権限がありません。'},403);
      const text=String(b.text??'').trim();
      const target=Number(b.target_member_id??0)||null;
      if(!text)return bad('伝言を入力してください。');
      if(target){
        const tm=await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(target,m.family_id).first<Row>();
        if(!tm)return bad('宛先のメンバーが見つかりません。');
      }
      const reminderRaw=String(b.reminder_at??'').trim();
      const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
      if(reminderRaw&&!reminderAt)return bad('通知日時が不正です。');
      if(reminderAt&&reminderAt<=nowJst())return bad('通知日時は現在より後の日時を指定してください。');
      await ctx.env.DB.prepare('UPDATE messages SET target_member_id=?,text=?,reminder_at=?,updated_at=? WHERE id=? AND family_id=?').bind(target,text,reminderAt,now,id,m.family_id).run();
      await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='message' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id).run();
      if(reminderAt){
        const rs=target
          ? await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1').bind(target,m.family_id).all<Row>()
          : await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND id<>?').bind(m.family_id,m.id).all<Row>();
        if(rs.results.length)await ctx.env.DB.batch(rs.results.map(r=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(r.id),'message_reminder','message',id,reminderAt,'pending',`【伝言】\n${text}`,now)));
      }
      await logActivity(ctx,'UPDATED','message',id);
      return json({ok:true});
    }

    if(action==='convert_shopping'||action==='convert_task'){
      const id=Number(b.id||0);
      const msg=await ctx.env.DB.prepare('SELECT * FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
      if(!msg)return json({ok:false,error:'伝言が見つかりません。'},404);
      if(action==='convert_shopping'&&msg.converted_to_shopping_id)return json({ok:true,id:Number(msg.converted_to_shopping_id),already:true});
      if(action==='convert_task'&&msg.converted_to_task_id)return json({ok:true,id:Number(msg.converted_to_task_id),already:true});
      const target=Number(msg.target_member_id||0)||null;

      if(action==='convert_shopping'){
        const name=String(b.name||msg.text||'').trim();
        if(!name)return bad('商品名を入力してください。');
        if(name.length>255)return bad('商品名は255文字以内にしてください。');
        const quantity=String(b.quantity||'1').trim()||'1';
        const category=String(b.category||'').trim()||null;
        const memo=String(b.memo||'').trim()||null;
        const dueRaw=String(b.due_date||'').trim();
        if(dueRaw&&!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw))return bad('期限の日付が不正です。');
        const productUrl=String(b.url||'').trim()||null;
        if(productUrl){
          try{
            const parsedUrl=new URL(productUrl);
            if(parsedUrl.protocol!=='http:'&&parsedUrl.protocol!=='https:')throw new Error();
          }catch{return bad('商品URLが不正です。');}
        }
        const taskId=Number(b.task_id||0)||null;
        if(taskId){
          const tr=await ctx.env.DB.prepare("SELECT id FROM tasks WHERE id=? AND family_id=? AND visibility_scope='FAMILY' AND status<>'completed' AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) LIMIT 1").bind(taskId,m.family_id).first<Row>();
          if(!tr)return bad('紐付け先タスクが見つかりません。');
        }
        const assignees=[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
        if(!assignees.length&&target)assignees.push(target);
        if(assignees.length){
          const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();
          const ids=new Set(valid.results.map(x=>Number(x.id)));
          if(assignees.some(x=>!ids.has(x)))return bad('担当者に無効なメンバーが含まれています。');
        }
        const r=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,quantity,category,memo,dueRaw||null,m.id,now,now,taskId,productUrl).run();
        const sid=Number(r.meta.last_row_id);
        if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));
        await ctx.env.DB.prepare('UPDATE messages SET converted_to_shopping_id=?,updated_at=? WHERE id=? AND family_id=?').bind(sid,now,id,m.family_id).run();
        await logActivity(ctx,'CONVERTED','message',id,{to:'shopping',shopping_item_id:sid});
        return commitSession(json({ok:true,id:sid}),ctx.session,ctx.env.APP_SECRET);
      }

      const mode=String(b.mode||'new');
      if(mode==='existing'){
        const taskId=Number(b.task_id||0);
        if(!taskId)return bad('追加先のタスクを選択してください。');
        const task=await ctx.env.DB.prepare("SELECT id,description FROM tasks WHERE id=? AND family_id=? AND visibility_scope='FAMILY' AND status<>'completed' AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) LIMIT 1").bind(taskId,m.family_id).first<Row>();
        if(!task)return bad('追加先のタスクが見つかりません。');
        if(b.append_message!==false&&String(b.append_message)!=='0'){
          const current=String(task.description||'').trim();
          const addition=String(msg.text||'').trim();
          if(addition&&!current.includes(addition))await ctx.env.DB.prepare('UPDATE tasks SET description=?,updated_at=? WHERE id=? AND family_id=?').bind(current?`${current}\n\n【伝言から追加】\n${addition}`:`【伝言から追加】\n${addition}`,now,taskId,m.family_id).run();
        }
        await ctx.env.DB.prepare('UPDATE messages SET converted_to_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,id,m.family_id).run();
        await logActivity(ctx,'CONVERTED','message',id,{to:'existing_task',task_id:taskId});
        try{await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,taskId);}catch{/* local mutation remains authoritative */}
        return commitSession(json({ok:true,id:taskId,mode:'existing'}),ctx.session,ctx.env.APP_SECRET);
      }

      const title=String(b.title||msg.text||'').trim();
      if(!title)return bad('タスク名を入力してください。');
      if(title.length>255)return bad('タスク名は255文字以内にしてください。');
      const isEvent=Boolean(b.is_event);
      const noDate=!isEvent&&Boolean(b.no_date);
      const date=String(b.date||'').trim();
      if(isEvent&&!date)return bad('イベントには日付を指定してください。');
      const endDate=String(b.end_date||date).trim();
      const allDay=b.all_day!==false&&String(b.all_day)!=='0';
      const st=String(b.start_time||'').trim(),et=String(b.end_time||'').trim();
      const range=buildStoredTaskRange({noDate,allDay,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDay});
      if(!range.ok){
        if(range.error==='START_DATE_INVALID')return bad('開始日が不正です。');
        if(range.error==='END_DATE_INVALID')return bad('終了日が不正です。');
        if(range.error==='DATE_ORDER')return bad('終了日は開始日以降にしてください。');
        if(range.error==='START_TIME_REQUIRED')return bad('開始時刻を入力してください。');
        if(range.error==='START_TIME_INVALID')return bad('開始時刻が不正です。');
        if(range.error==='END_TIME_INVALID')return bad('終了時刻が不正です。');
        return bad('終了時刻は開始時刻以降にしてください。');
      }
      const startAt=range.startAt,endAt=range.endAt;
      if(startAt&&endAt&&endAt<startAt)return bad('終了日時は開始日時以降にしてください。');
      const completionMode=String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
      const calendarVisible=b.calendar_visible===false||String(b.calendar_visible)==='0'?0:1;
      const calendarColor=normalizeCalendarColor(b.calendar_color);
      const reminderRaw=String(b.reminder_at||'').trim();
      const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
      if(reminderRaw&&!reminderAt)return bad('通知日時が不正です。');
      if(reminderAt&&reminderAt<=now)return bad('通知日時は現在より後の日時を指定してください。');
      const assignees=[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
      if(!assignees.length&&target)assignees.push(target);
      if(assignees.length){
        const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();
        const validIds=new Set(valid.results.map(x=>Number(x.id)));
        if(assignees.some(x=>!validIds.has(x)))return bad('担当者に無効なメンバーが含まれています。');
      }
      const due=noDate?null:(endAt||startAt||`${date} 00:00:00`);
      const description=String(b.description||msg.text||'').trim()||null;
      const r=await ctx.env.DB.prepare("INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(m.family_id,title,description,due,'pending',completionMode,m.id,now,now,startAt,endAt,String(b.location||'').trim()||null,allDay?1:0,calendarVisible,calendarColor,isEvent?'EVENT':'TASK',0,reminderAt).run();
      const tid=Number(r.meta.last_row_id);
      if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(tid,mid,m.family_id)));
      if(reminderAt&&assignees.length){
        const rs=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();
        if(rs.results.length)await ctx.env.DB.batch(rs.results.map(x=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(x.id),'task_reminder','task',tid,reminderAt,'pending',`【タスク】${title}\n${description||'詳細なし'}`,now)));
      }
      await ctx.env.DB.prepare('UPDATE messages SET converted_to_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(tid,now,id,m.family_id).run();
      await logActivity(ctx,'CONVERTED','message',id,{to:'new_task',task_id:tid});
      try{await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,tid);}catch{/* local mutation remains authoritative */}
      return commitSession(json({ok:true,id:tid,mode:'new'}),ctx.session,ctx.env.APP_SECRET);
    }

    const text=String(b.text??'').trim();
    const target=Number(b.target_member_id??0)||null;
    if(!text)return bad('伝言を入力してください。');
    const reminderRaw=String(b.reminder_at??'').trim();
    const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
    if(reminderRaw&&!reminderAt)return bad('通知日時が不正です。');
    if(reminderAt&&reminderAt<=nowJst())return bad('通知日時は現在より後の日時を指定してください。');
    const ins=await ctx.env.DB.prepare('INSERT INTO messages(family_id,sender_id,target_member_id,text,reminder_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,target,text,reminderAt,now,now).run();
    const msgId=Number(ins.meta.last_row_id);
    if(reminderAt){
      const rs=target
        ? await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1').bind(target,m.family_id).all<Row>()
        : await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND id<>?').bind(m.family_id,m.id).all<Row>();
      if(rs.results.length)await ctx.env.DB.batch(rs.results.map(r=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(r.id),'message_reminder','message',msgId,reminderAt,'pending',`【伝言】\n${text}`,now)));
    }
    return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
  }

  const [rows,members,tasks]=await Promise.all([
    ctx.env.DB.prepare(`SELECT msg.*,s.name sender_name,r.name recipient_name,sh.name shopping_name,t.title task_title FROM messages msg LEFT JOIN members s ON s.id=msg.sender_id LEFT JOIN members r ON r.id=msg.target_member_id LEFT JOIN shopping_items sh ON sh.id=msg.converted_to_shopping_id LEFT JOIN tasks t ON t.id=msg.converted_to_task_id AND (t.visibility_scope='FAMILY' OR t.private_owner_id=?) WHERE msg.family_id=? ORDER BY msg.created_at DESC,msg.id DESC LIMIT 100`).bind(m.id,m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare("SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND status<>'completed' AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) ORDER BY COALESCE(start_at,due_at),id DESC LIMIT 200").bind(m.family_id).all<Row>(),
  ]);
  const today=dateOnly();
  const body=`<div class="page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>💬 伝言</h1></div><a class="btn" href="/app/message_new.php">＋ 伝言する</a></div>
  <div class="card message-list"><h2>伝言一覧</h2>${rows.results.map(r=>`<div class="row message-row"><div>${esc(r.text)}</div><div class="meta">${esc(r.sender_name||'')} → ${esc(r.recipient_name||'全員')} ・ ${esc(r.created_at||'')}</div>${r.reminder_at?`<div class="meta">🔔 通知 ${esc(String(r.reminder_at).slice(0,16))}</div>`:''}${r.converted_to_shopping_id?`<div class="converted-badge">🛒 買い物：${esc(r.shopping_name||'登録済み')}</div>`:r.converted_to_task_id?`<div class="converted-badge">📝 タスク・イベント：${esc(r.task_title||'登録済み')}</div>`:`<div class="message-actions"><button class="btn small convert-shopping" data-id="${r.id}" data-text="${esc(r.text)}" data-target="${Number(r.target_member_id||0)}">🛒 買い物に追加</button><button class="btn gray small convert-task" data-id="${r.id}" data-text="${esc(r.text)}" data-target="${Number(r.target_member_id||0)}">📝 タスク・イベントに追加</button></div>`}<div class="message-actions"><button class="btn gray small edit-message" data-id="${r.id}" data-text="${esc(r.text)}" data-target="${Number(r.target_member_id||0)}" data-reminder="${esc(r.reminder_at||'')}">編集</button><button class="btn danger small delete-message" data-id="${r.id}">削除</button></div></div>`).join('')||'<p>伝言はありません。</p>'}</div>
  <div class="card form-card"><form id="msgForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken??'')}"><label>宛先</label><select name="target_member_id"><option value="0">家族全員</option>${members.results.map((r:Row)=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label>伝言</label><textarea name="text" required></textarea><label>通知日時（任意）</label><input type="datetime-local" name="reminder_at"><p class="small">指定すると宛先へその日時に伝言内容を設定した通知方法で通知します。</p><button type="submit">投稿する</button></form></div>
  <div class="message-shopping-backdrop" id="messageShoppingModal" aria-hidden="true"><div class="message-shopping-dialog"><div class="section-head"><h2>🛒 伝言を買い物に追加</h2><button type="button" class="btn gray small" id="messageShoppingClose">×</button></div><form id="messageShoppingForm"><input type="hidden" name="message_id"><label>商品名</label><input name="name" maxlength="255" required><label>数量</label><input name="quantity" value="1"><label>カテゴリー</label><input name="category" placeholder="例：食品"><label>期限（任意）</label><input type="date" name="due_date"><label>紐付けるタスク（任意）</label><select name="task_id"><option value="0">タスクなし</option>${tasks.results.map(t=>`<option value="${t.id}">${esc(t.title)}${t.start_at||t.due_at?' ・ '+esc(String(t.start_at||t.due_at).slice(0,10)):''}</option>`).join('')}</select><label>担当者</label><div class="assignee-list">${members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="shopping_assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div><label>メモ</label><textarea name="memo"></textarea><label>商品URL（任意）</label><input type="url" name="url" placeholder="https://..."><div id="messageShoppingStatus" class="small" aria-live="polite"></div><button type="submit" id="messageShoppingSubmit">買い物に追加</button></form></div></div>
  <div class="message-task-backdrop" id="messageTaskModal" aria-hidden="true"><div class="message-task-dialog"><div class="section-head"><h2>📝 伝言をタスク・イベントに追加</h2><button type="button" class="btn gray small" id="messageTaskClose">×</button></div><form id="messageTaskForm"><input type="hidden" name="message_id"><label>追加方法</label><select name="mode" id="messageTaskMode"><option value="existing">既存タスク・イベントに追加</option><option value="new">新しいタスク・イベントを作成</option></select><div id="existingTaskFields"><label>追加先タスク・イベント</label><select name="task_id"><option value="0">選択してください</option>${tasks.results.map(t=>`<option value="${t.id}">${esc(t.title)}${t.start_at||t.due_at?' ・ '+esc(String(t.start_at||t.due_at).slice(0,10)):''}</option>`).join('')}</select><label class="checkrow"><input type="checkbox" name="append_message" checked><span>伝言本文を説明へ追記する</span></label></div><div id="newTaskFields" style="display:none"><label>タイトル</label><input name="title" maxlength="255"><label>説明</label><textarea name="description"></textarea><div class="date-option-row"><div><span class="small">開始日</span><input type="date" name="date" value="${today}"></div><div><span class="small">終了日</span><input type="date" name="end_date" value="${today}"></div><label class="checkrow"><input type="checkbox" name="no_date"><span>期限なし</span></label></div><label class="checkrow"><input id="messageTaskAllDay" type="checkbox" name="all_day" checked><span>終日</span></label><div id="messageTaskTimeFields" class="task-time-fields message-task-time" style="display:none"><div><label>開始時刻</label><input type="time" name="start_time"></div><div><label>終了時刻</label><input type="time" name="end_time"></div></div><label>場所</label><input name="location"><label>担当者</label><div class="assignee-list">${members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="task_assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div><label class="checkrow"><input type="checkbox" name="is_event"><span>イベントとして登録（チェック・期限切れ対象なし）</span></label><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">担当者全員が完了</option></select><label>通知日時（任意）</label><input type="datetime-local" name="task_reminder_at"><label class="checkrow"><input id="messageTaskCalendarVisible" type="checkbox" name="calendar_visible" checked><span>カレンダーに表示する</span></label><div id="messageTaskCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color"><option value="#7c3aed">紫</option><option value="#2563eb">青</option><option value="#16a34a">緑</option><option value="#ea580c">橙</option><option value="#dc2626">赤</option><option value="#db2777">ピンク</option><option value="#0891b2">水色</option><option value="#64748b">灰</option></select></div></div><div id="messageTaskStatus" class="small" aria-live="polite"></div><button type="submit" id="messageTaskSubmit">追加する</button></form></div></div>
  <div class="message-edit-backdrop" id="messageEditModal" aria-hidden="true"><div class="message-edit-dialog"><div class="section-head"><h2>✏️ 伝言を編集</h2><button type="button" class="btn gray small" id="messageEditClose">×</button></div><form id="messageEditForm"><input type="hidden" name="message_id"><label>宛先</label><select name="target_member_id"><option value="0">家族全員</option>${members.results.map((r:Row)=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label>伝言</label><textarea name="text" maxlength="5000" required></textarea><label>通知日時（任意）</label><input type="datetime-local" name="reminder_at"><p class="small">空欄で通知予約を解除します。</p><div id="messageEditStatus" class="small" aria-live="polite"></div><button type="submit" id="messageEditSubmit">保存する</button></form></div></div>
  <script type="application/json" id="messagesPayload">${JSON.stringify({csrf:ctx.session.csrfToken||'',today}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script>
  <script src="/assets/messages.js?v=${APP_VERSION}"></script>`;
  return html(layout('伝言',body,'/app/messages.php'));
}
