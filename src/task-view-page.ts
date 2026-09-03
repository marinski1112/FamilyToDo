import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html, redirect } from './response';
import { taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const TASK_DETAIL_RETURN_PATHS=new Set(['/app/tasks.php','/app/calendar.php']);

function resolveTaskDetailReturn(request:Request,date:string):{url:string;label:string}{
  const fallback=`/app/tasks.php?date=${encodeURIComponent(date||'')}`;
  const current=new URL(request.url);
  const explicit=current.searchParams.get('return_to');
  const candidates=[explicit,request.headers.get('referer')];
  for(const raw of candidates){
    if(!raw)continue;
    try{
      const candidate=new URL(raw,current.origin);
      if(candidate.origin!==current.origin||!TASK_DETAIL_RETURN_PATHS.has(candidate.pathname))continue;
      return {url:`${candidate.pathname}${candidate.search}${candidate.hash}`,label:candidate.pathname==='/app/calendar.php'?'カレンダーに戻る':'チェックリストに戻る'};
    }catch{}
  }
  return {url:fallback,label:'チェックリストに戻る'};
}

/** Canonical retained task/event detail view, including recurrence occurrences. */
export async function taskView(ctx:AppContext,id:number):Promise<Response>{
  const m=ctx.member;
  if(!m){
    const url=new URL(ctx.request.url);
    return redirect(`/login.php?next=${encodeURIComponent(url.pathname+url.search)}`);
  }
  if(!Number.isInteger(id)||id===0)return new Response('Not Found',{status:404});

  const isVirtual=id<0;
  const occurrenceId=Math.abs(id);
  let task:Row|null=null;
  let occurrence:Row|null=null;

  if(isVirtual){
    occurrence=await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.status occurrence_status,o.recurrence_rule_id,r.name recurrence_name,t.completion_mode,r.task_id,t.*
      FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id
      JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
      WHERE o.id=? AND o.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(occurrenceId,m.family_id,m.id).first<Row>();
    if(!occurrence)return new Response('定期タスクの発生日が見つかりません。',{status:404});
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(occurrence.task_id)).first<Row>();
    const assignedCount=Number(assigned?.c||0);
    const done=await ctx.env.DB.prepare(`SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN members cm ON cm.id=c.member_id AND cm.family_id=? AND cm.active=1 WHERE c.occurrence_id=? AND (NOT EXISTS(SELECT 1 FROM task_assignees ta0 JOIN members am0 ON am0.id=ta0.member_id AND am0.active=1 WHERE ta0.task_id=?) OR EXISTS(SELECT 1 FROM task_assignees ta1 JOIN members am1 ON am1.id=ta1.member_id AND am1.active=1 WHERE ta1.task_id=? AND ta1.member_id=c.member_id))`).bind(m.family_id,occurrenceId,Number(occurrence.task_id),Number(occurrence.task_id)).first<Row>();
    const mode=assignedCount>0?String(occurrence.completion_mode||'ANY').toUpperCase():'ANY';
    const complete=mode==='ALL'?assignedCount>0&&Number(done?.c||0)>=assignedCount:Number(done?.c||0)>0;
    task={...occurrence,id,status:complete?'completed':'pending',due_at:`${occurrence.occurrence_date} 00:00:00`,start_at:occurrence.start_at?`${occurrence.occurrence_date} ${String(occurrence.start_at).slice(11,19)}`:null,end_at:occurrence.end_at?`${occurrence.occurrence_date} ${String(occurrence.end_at).slice(11,19)}`:null};
  }else{
    task=await ctx.env.DB.prepare(`SELECT t.*, COALESCE(GROUP_CONCAT(am.name,'、'),'') assignees,
      c.name completer_name, cr.name creator_name
      FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN members am ON am.id=ta.member_id
      LEFT JOIN members c ON c.id=t.completed_by LEFT JOIN members cr ON cr.id=t.created_by
      WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} GROUP BY t.id LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
  }
  if(!task)return new Response('タスクが見つかりません。',{status:404});

  const exceptionOrigin=!isVirtual?await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.recurrence_rule_id,r.name recurrence_name FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.exception_task_id=? AND o.family_id=? LIMIT 1`).bind(id,m.family_id).first<Row>():null;
  const baseTaskId=isVirtual?Number(occurrence?.task_id||0):id;
  const [history,linkedShopping,linkedItems,reminders,assigneeRows]=await Promise.all([
    isVirtual?ctx.env.DB.prepare(`SELECT c.completed_at occurred_at,am.name member_name,'COMPLETED' action FROM recurrence_occurrence_completions c LEFT JOIN members am ON am.id=c.member_id WHERE c.occurrence_id=? ORDER BY c.completed_at DESC`).bind(occurrenceId).all<Row>():ctx.env.DB.prepare(`SELECT h.*,am.name member_name FROM task_completion_history h LEFT JOIN members am ON am.id=h.member_id WHERE h.task_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30`).bind(id).all<Row>(),
    ctx.env.DB.prepare(`SELECT s.*,COALESCE((SELECT GROUP_CONCAT(am.name,'、') FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=s.id),'') assignees FROM shopping_items s WHERE s.task_id=? AND s.family_id=? ORDER BY s.status,s.category,s.name,s.id`).bind(baseTaskId,m.family_id).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*,COALESCE((SELECT GROUP_CONCAT(am.name,'、') FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=i.id),'') assignees FROM items i WHERE i.task_id=? AND i.family_id=? ORDER BY i.status,i.name,i.id`).bind(baseTaskId,m.family_id).all<Row>(),
    ctx.env.DB.prepare(`SELECT id,member_id,notify_at,status,message FROM notifications WHERE target_type='task' AND target_id=? AND family_id=? ORDER BY notify_at,id`).bind(baseTaskId,m.family_id).all<Row>(),
    ctx.env.DB.prepare(`SELECT am.id,am.name FROM task_assignees ta JOIN members am ON am.id=ta.member_id WHERE ta.task_id=? AND am.active=1 ORDER BY am.id`).bind(baseTaskId).all<Row>()
  ]);

  const assignees=assigneeRows.results.map(r=>String(r.name)).join('、');
  const isEvent=!isVirtual&&String(task.task_kind||'').toLowerCase()==='event';
  const role=String(m.role||'').toUpperCase();
  const canEdit=!isVirtual&&(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id);
  const dateForChildren=String(task.start_at||task.due_at||'').slice(0,10);
  const returnContext=resolveTaskDetailReturn(ctx.request,dateForChildren);
  const childShoppingHtml=linkedShopping.results.length?`<div class="card"><div class="section-head"><h2>🛒 このタスクの買い物 <span class="small">(${linkedShopping.results.length})</span></h2>${!isVirtual?`<a class="btn gray small" href="/app/shopping_new.php?date=${encodeURIComponent(dateForChildren)}&task_id=${baseTaskId}">＋ 追加</a>`:''}</div>${linkedShopping.results.map(r=>`<div class="row"><label class="shopping-check-row"><input type="checkbox" class="task-child-toggle" data-type="shopping" data-id="${r.id}" ${r.status==='completed'?'checked':''}><span class="${r.status==='completed'?'done':''}">${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a>`:esc(r.name)}${r.quantity&&r.quantity!=='1'?` × ${esc(r.quantity)}`:''}</span></label><div class="meta">${[r.category,r.assignees?'担当 '+r.assignees:'',r.due_date?'期限 '+r.due_date:''].filter(Boolean).map(esc).join(' ・ ')}</div></div>`).join('')}</div>`:'';
  const childItemsHtml=`<div class="card"><div class="section-head"><h2>🎒 このタスクの持ち物 <span class="small">(${linkedItems.results.length})</span></h2>${!isVirtual?`<a class="btn gray small" href="/item/new.php?date=${encodeURIComponent(dateForChildren)}&task_id=${baseTaskId}">＋ 追加</a>`:''}</div>${linkedItems.results.map(r=>`<div class="row"><label class="shopping-check-row"><input type="checkbox" class="task-child-toggle" data-type="item" data-id="${r.id}" ${r.status==='completed'?'checked':''}><span class="${r.status==='completed'?'done':''}">${esc(r.name)}</span></label><div class="meta">${esc(r.assignees||'')}</div></div>`).join('')||'<p class="empty">紐付く持ち物はありません。</p>'}</div>`;
  const reminderHtml=reminders.results.length?`<div class="card"><h2>🔔 通知</h2>${reminders.results.map(r=>`<div class="row"><div>${esc(String(r.notify_at||'').slice(0,16))} ・ ${esc(r.status)}</div><div class="meta">${esc(r.message||'')}</div></div>`).join('')}</div>`:'';
  const convertHtml=isVirtual?`<form method="post" action="/task/convert_occurrence.php" class="card"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input type="hidden" name="occurrence_id" value="${occurrenceId}"><button class="btn">この日だけ通常タスクにする</button></form>`:'';
  const body=`<div class="card"><h1>${isEvent?'📌 イベント詳細':'📝 タスク詳細'}</h1><h2>${esc(task.title)}</h2><div class="meta">${esc(dateForChildren||'指定なし')}${isVirtual?' ・ 🔁 定期タスクの発生日':''}</div>
  ${task.start_at?`<div class="meta">開始：${esc(task.start_at)}${task.end_at?' ・ 終了：'+esc(task.end_at):''}</div>`:''}${task.location?`<div class="meta">場所：${esc(task.location)}</div>`:''}${assignees?`<p>担当：${esc(assignees)}</p>`:''}${task.description?`<div class="sub-card">${esc(task.description).replaceAll('\n','<br>')}</div>`:''}
  ${isEvent?'<p><span class="event-badge">イベント</span> <span class="small">チェック・期限切れ判定の対象外</span></p>':`<p>状態：<strong id="taskStatus">${task.status==='completed'?'完了':'未完了'}</strong></p><label class="checkrow"><input type="checkbox" id="done" ${task.status==='completed'?'checked':''}> 完了</label>`}
  ${canEdit?`<p><a class="btn" href="/task/edit.php?id=${id}">編集</a> ${exceptionOrigin?`<button class="btn danger" id="exceptionDeleteOpen" type="button">削除</button>`:`<button class="btn danger" id="del" type="button">削除</button>`}</p>`:''}<p><a class="btn gray" href="${esc(returnContext.url)}">${esc(returnContext.label)}</a></p></div>${convertHtml}${childShoppingHtml}${childItemsHtml}${reminderHtml}
  ${isEvent?'':`<div class="card"><h2>完了履歴</h2>${history.results.map(h=>`<div class="row">${esc(h.action)} ・ ${esc(h.member_name||'')} ・ ${esc(h.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div>`}
  ${exceptionOrigin?`<div class="exception-delete-backdrop" id="exceptionDeleteModal" aria-hidden="true"><div class="exception-delete-sheet" role="dialog" aria-modal="true"><div class="section-head"><h2>この日の例外タスクを削除</h2><button class="btn gray small" id="exceptionDeleteClose" type="button">×</button></div><p><strong>${esc(exceptionOrigin.occurrence_date)}</strong> は「${esc(exceptionOrigin.recurrence_name||'定期タスク')}」から通常タスク化した日です。</p><p class="small">削除後の定期タスク側の扱いを選んでください。</p><button class="btn exception-delete-choice" id="exceptionDeleteRestore" type="button">元の定期日に戻す</button><button class="btn danger exception-delete-choice" id="exceptionDeleteExclude" type="button">この日だけ除外したまま削除</button></div></div>`:''}
  <script type="application/json" id="taskViewPayload">${JSON.stringify({csrf:ctx.session.csrfToken||'',id,occurrenceId,toggleType:isVirtual?'recurrence':'task',returnUrl:returnContext.url}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/task-view.js?v=12.147.0-wave128"></script>`;
  return html(layout(isEvent?'イベント詳細':'タスク詳細',body,''));
}
