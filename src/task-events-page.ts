import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { recurringForDate } from './recurrence-projection';
import { html, redirect } from './response';
import { taskVisibilitySql } from './task-visibility';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;

type TaskEventsData={tasks:Row[];items:Row[];shopping:Row[];expiredTasks:Row[]};

const LINKED_SHOPPING_TASK_CHUNK_SIZE=80;
const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(d);
const compareShoppingRows=(a:Row,b:Row)=>{
  const status=String(a.status??'').localeCompare(String(b.status??''));if(status)return status;
  const nullDue=Number(a.due_date==null)-Number(b.due_date==null);if(nullDue)return nullDue;
  for(const key of ['due_date','category','name'] as const){const diff=String(a[key]??'').localeCompare(String(b[key]??''));if(diff)return diff;}
  return Number(a.id||0)-Number(b.id||0);
};

async function expiredTasksFor(ctx:AppContext):Promise<Row[]>{
  const member=ctx.member;if(!member)return [];
  const todayJst=dateOnly();
  return (await ctx.env.DB.prepare(`SELECT t.id,t.title,t.status,t.due_at,t.start_at,t.end_at,t.location,t.visibility_scope,
      (SELECT GROUP_CONCAT(am.name,'、') FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id) AS assignees
    FROM tasks t WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending'
      AND (t.task_kind IS NULL OR lower(t.task_kind)='task')
      AND COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL
      AND date(COALESCE(t.end_at,t.due_at,t.start_at)) < date(?)
    ORDER BY COALESCE(t.end_at,t.due_at,t.start_at),t.id`).bind(member.family_id,member.id,todayJst).all<Row>()).results;
}

async function unorganizedTasksFor(ctx:AppContext):Promise<Row[]>{
  const member=ctx.member;if(!member)return [];
  return (await ctx.env.DB.prepare(`SELECT t.id,t.title,t.description,t.created_at,t.created_by,COALESCE(GROUP_CONCAT(am.name,'、'),'') assignees
    FROM tasks t
    LEFT JOIN task_assignees ta ON ta.task_id=t.id
    LEFT JOIN members am ON am.id=ta.member_id AND am.active=1
    WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending'
      AND (t.task_kind IS NULL OR lower(t.task_kind)<>'event')
      AND t.start_at IS NULL AND t.end_at IS NULL AND t.due_at IS NULL
    GROUP BY t.id ORDER BY t.sort_order,t.id DESC LIMIT 50`).bind(member.family_id,member.id).all<Row>()).results;
}

async function makeTaskEventsData(ctx:AppContext,date:string):Promise<TaskEventsData>{
  const member=ctx.member;if(!member)return {tasks:[],items:[],shopping:[],expiredTasks:[]};
  const [tasks,items,recurring,expiredTasks]=await Promise.all([
    ctx.env.DB.prepare(`SELECT t.*,
      (SELECT GROUP_CONCAT(am.name,'、') FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id) AS assignees
      FROM tasks t
      WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status IN ('pending','completed')
        AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template'))
        AND (
          (lower(COALESCE(t.task_kind,''))='event' AND (
            (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND date(COALESCE(t.end_at,t.start_at))>=date(?))
            OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?))
          ))
          OR (lower(COALESCE(t.task_kind,''))<>'event' AND (
            (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
            OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?))
          ))
        )
      ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id`).bind(member.family_id,member.id,date,date,date,date,date,date).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*,
      (SELECT GROUP_CONCAT(am.name,'、') FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=i.id) AS assignees
      FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id
      WHERE i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('pt')}) AND i.due_at IS NOT NULL AND date(i.due_at)=date(?)
      ORDER BY i.due_at,i.status,i.id`).bind(member.family_id,member.id,date).all<Row>(),
    recurringForDate(ctx,date),
    expiredTasksFor(ctx),
  ]);
  const taskRows=[...tasks.results,...recurring].sort((a,b)=>String(a.start_at||a.due_at).localeCompare(String(b.start_at||b.due_at)));
  const baseTaskIds=[...new Set(taskRows.map(row=>Number(row.id)<0?Number(row.task_id||0):Number(row.id||0)).filter(id=>Number.isSafeInteger(id)&&id>0))];
  const baseShopping=await ctx.env.DB.prepare(`SELECT s.*,t.title AS task_title,
      (SELECT GROUP_CONCAT(am.name,'、') FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=s.id) AS assignees
      FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
      WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')})
        AND ((s.due_date IS NOT NULL AND s.due_date=?) OR (s.due_date IS NULL AND s.task_id IS NULL))
      ORDER BY s.status,(s.due_date IS NULL),s.due_date,s.category,s.name,s.id`)
    .bind(member.family_id,member.id,date).all<Row>();
  const linkedShoppingResults=await Promise.all(Array.from({length:Math.ceil(baseTaskIds.length/LINKED_SHOPPING_TASK_CHUNK_SIZE)},(_,index)=>{
    const chunk=baseTaskIds.slice(index*LINKED_SHOPPING_TASK_CHUNK_SIZE,(index+1)*LINKED_SHOPPING_TASK_CHUNK_SIZE);
    return ctx.env.DB.prepare(`SELECT s.*,t.title AS task_title,
        (SELECT GROUP_CONCAT(am.name,'、') FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=s.id) AS assignees
      FROM shopping_items s JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
      WHERE s.family_id=? AND ${taskVisibilitySql('t')} AND s.task_id IN (${chunk.map(()=>'?').join(',')})`)
      .bind(member.family_id,member.id,...chunk).all<Row>();
  }));
  const shoppingById=new Map<string,Row>();
  for(const row of [...baseShopping.results,...linkedShoppingResults.flatMap(result=>result.results)])shoppingById.set(String(row.id),row);
  const shopping=[...shoppingById.values()].sort(compareShoppingRows);
  return {tasks:taskRows,items:items.results,shopping,expiredTasks};
}

function renderTaskEventsPage(ctx:AppContext,date:string,data:TaskEventsData,unorganized:Row[]):string{
  const csrf=ctx.session.csrfToken??'';
  const shoppingByTask=new Map<number,Row[]>();
  const itemsByTask=new Map<number,Row[]>();
  for(const item of data.shopping){const tid=Number(item.task_id||0);if(tid){const list=shoppingByTask.get(tid)||[];list.push(item);shoppingByTask.set(tid,list);}}
  for(const item of data.items){const tid=Number(item.task_id||0);if(tid){const list=itemsByTask.get(tid)||[];list.push(item);itemsByTask.set(tid,list);}}
  const safeProductUrl=(value:unknown)=>{const raw=String(value||'').trim();if(!raw||raw.length>2048)return '';try{const parsed=new URL(raw);if(parsed.username||parsed.password)return '';return parsed.protocol==='http:'||parsed.protocol==='https:'?parsed.href:'';}catch{return '';}};
  const shoppingRows=(items:Row[])=>items.map(item=>{
    const productUrl=safeProductUrl(item.url);
    const meta=[item.category||'',item.task_title?'予定 '+item.task_title:'',item.assignees?'担当 '+item.assignees:'',item.due_date?'期限 '+item.due_date:''].filter(Boolean).map(esc).join(' ・ ');
    return `<div class="row linked-shopping-row"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="shopping" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}"><a href="/app/shopping_edit.php?id=${esc(item.id)}">${esc(item.name)}</a>${item.quantity&&item.quantity!=='1'?` × ${esc(item.quantity)}`:''}</span></label><div class="meta">${meta}${productUrl?` ・ <a href="${esc(productUrl)}" target="_blank" rel="noopener noreferrer">商品ページ</a>`:''}</div></div>`;
  }).join('');
  const taskRows=data.tasks.map(task=>{
    const templateId=Number(task.task_id||0)||Math.abs(Number(task.id));
    const linkedShopping=shoppingByTask.get(templateId)||shoppingByTask.get(Math.abs(Number(task.id)))||[];
    const linkedItems=itemsByTask.get(templateId)||itemsByTask.get(Math.abs(Number(task.id)))||[];
    const itemRows=linkedItems.map(item=>`<div class="linked-shopping-row"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}">🎒 ${esc(item.name)}</span></label></div>`).join('');
    const childItems=linkedItems.length?`<details class="task-shopping"><summary>🎒 持ち物 ${linkedItems.length}件</summary>${itemRows}</details>`:'';
    const shoppingAdd=`<a class="task-shopping-add" href="/app/shopping_new.php?date=${encodeURIComponent(date)}&task_id=${templateId}" aria-label="この予定に買い物を追加" title="買い物を追加"><span aria-hidden="true">🛒</span><span class="shopping-plus-badge" aria-hidden="true">＋</span></a>`;
    const shoppingCount=linkedShopping.length?`<a class="task-shopping-count" href="#shopping-checklist">🛒 ${linkedShopping.length}件</a>`:'';
    const isEvent=String(task.task_kind||'').toLowerCase()==='event';
    const privateBadge=String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':'';
    const titleHtml=Number(task.id)<0?`<span>${esc(task.title)} <small>(定期)</small></span>`:`${privateBadge}<a href="/task/view.php?id=${task.id}">${isEvent?'📌 ':''}${esc(task.title)}</a>`;
    const mainHtml=isEvent?`<div class="task-main event-main"><span>${titleHtml} <small>(イベント)</small></span><div>${shoppingCount}${shoppingAdd}</div></div>`:`<div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="${Number(task.id)<0?'recurrence':'task'}" data-id="${esc(task.id)}" ${Number(task.id)<0?`data-occurrence-id="${esc(task.recurrence_occurrence_id)}"`:''} ${task.status==='completed'?'checked':''}><span class="${task.status==='completed'?'done':''}">${titleHtml}</span></label><div>${shoppingCount}${shoppingAdd}</div></div>`;
    const familyLogAction=Number(task.id)<0&&Number(task.family_log_template_id||0)?`<button type="button" class="btn small secondary occurrence-family-log" data-occurrence-id="${esc(task.recurrence_occurrence_id)}">🐣 記録して完了</button>`:'';
    return `<div class="row task-row ${isEvent?'event-task-row':''}">${mainHtml}<div class="meta">${esc(task.assignees||'')}${task.start_at?' ・ '+esc(String(task.start_at).slice(11,16)):task.due_at?' ・ '+(String(task.due_at).slice(11,16)==='00:00'?'終日':esc(String(task.due_at).slice(11,16))):''}${task.location?' ・ '+esc(task.location):''}</div>${familyLogAction}${childItems}</div>`;
  }).join('');
  const standaloneItems=data.items.filter(item=>!Number(item.task_id||0));
  const itemRows=standaloneItems.map(item=>`<div class="row"><label style="display:flex;gap:10px;align-items:center"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}"><a href="/item/edit.php?id=${esc(item.id)}">${esc(item.name)}</a></span></label><div class="meta">${item.assignees?'担当 '+esc(item.assignees):''}</div></div>`).join('');
  const unorganizedHtml=unorganized.length?`<div class="card section-card unorganized-section"><div class="section-head"><h2>📋 未整理</h2><span class="meta">期限なし ${unorganized.length}件</span></div>${unorganized.map(task=>`<div class="row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="task" data-id="${task.id}"><span><a href="/task/view.php?id=${task.id}">${esc(task.title)}</a></span></label><div class="meta">${esc(task.assignees||'')}</div></div>`).join('')}<a class="btn small secondary" href="/task/new.php?date=">＋ 未整理タスクを追加</a></div>`:'';
  const expiredHtml=data.expiredTasks.length?`<details class="card expired-tasks"><summary>⚠️ 期限切れタスク ${data.expiredTasks.length}件</summary><div class="expired-list">${data.expiredTasks.map(task=>`<div class="expired-row" data-expired-task-id="${esc(task.id)}"><label class="expired-task-main"><input class="check toggle expired-checkbox" type="checkbox" data-type="task" data-id="${esc(task.id)}"><span>${String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':''}<a href="/task/view.php?id=${esc(task.id)}">${esc(task.title)}</a></span></label><div class="expired-meta">期限 ${esc(String(task.end_at||task.due_at||task.start_at).slice(0,10))} ・ 担当 ${esc(task.assignees||'未設定')}${task.location?' ・ '+esc(task.location):''}</div></div>`).join('')}</div></details>`:'';
  const cursor=new Date(`${date}T12:00:00Z`);cursor.setUTCDate(cursor.getUTCDate()-1);const prev=cursor.toISOString().slice(0,10);cursor.setUTCDate(cursor.getUTCDate()+2);const next=cursor.toISOString().slice(0,10);
  const eventCount=data.tasks.filter(task=>String(task.task_kind||'').toLowerCase()==='event').length;
  const checkableTaskCount=data.tasks.length-eventCount;
  const summary=`<div class="task-event-summary meta">タスク ${checkableTaskCount}${eventCount?` ・ イベント ${eventCount}`:''} ・ 買い物 ${data.shopping.length}</div>`;
  const shoppingSection=`<div class="card section-card shopping-checklist-section" id="shopping-checklist"><div class="section-head"><div><h2>🛒 買い物</h2><div class="meta">選択日が期限、またはこの日の予定に紐付く買い物</div></div><div><a class="btn small" href="/app/shopping_new.php?date=${encodeURIComponent(date)}">＋ 追加</a> <a class="btn small secondary" href="/app/shopping.php">一覧・管理</a></div></div>${shoppingRows(data.shopping)||'<p class="empty">対象日の買い物はありません。</p>'}</div>`;
  const body=`<div class="daily-head"><div><h1>✅ チェックリスト</h1><div class="date-title">${esc(date)}</div>${summary}</div><div class="date-nav"><a class="btn gray" href="/app/tasks.php?date=${prev}">‹</a><a class="btn gray" href="/app/tasks.php?date=${next}">›</a></div></div><div class="card section-card task-section"><div class="section-head"><h2>📝 タスク・イベント</h2><a class="btn small" href="/task/new.php?date=${encodeURIComponent(date)}&return=tasks">＋ 追加</a></div>${taskRows||'<p class="empty">対象日のタスク・イベントはありません。</p>'}</div>${shoppingSection}${unorganizedHtml}${expiredHtml}<div class="card section-card item-section"><div class="section-head"><h2>🎒 持ち物</h2><a class="btn small" href="/item/new.php?date=${encodeURIComponent(date)}">＋ 追加</a></div>${itemRows||'<p class="empty">対象日の持ち物はありません。</p>'}</div><script type="application/json" id="dailyPayload">${JSON.stringify({csrf}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/task-events.js?v=${APP_VERSION}"></script><script src="/assets/occurrence-family-log.js?v=${APP_VERSION}"></script>`;
  return layout('チェックリスト',body,'/app/tasks.php');
}

/** Unified Task/Event + Shopping checklist page. Events are display-only rows. */
export async function taskEvents(_request:Request,ctx:AppContext,targetDate:string):Promise<Response>{
  const member=ctx.member;
  if(!member){const url=new URL(ctx.request.url);return redirect(`/login.php?next=${encodeURIComponent(url.pathname+url.search)}`);}
  const safeDate=/^\d{4}-\d{2}-\d{2}$/.test(targetDate)?targetDate:dateOnly();
  const [data,unorganized]=await Promise.all([makeTaskEventsData(ctx,safeDate),unorganizedTasksFor(ctx)]);
  return html(renderTaskEventsPage(ctx,safeDate,data,unorganized));
}