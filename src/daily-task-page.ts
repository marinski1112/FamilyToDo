import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { recurringForDate } from './recurrence-projection';
import { taskVisibilitySql } from './task-visibility';
import { APP_VERSION } from './version';
import { html, redirect } from './response';

type Row=Record<string,unknown>;
type DailyData={tasks:Row[];items:Row[];shopping:Row[];expiredTasks:Row[]};

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(d);

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

async function makeDailyData(ctx:AppContext,date:string):Promise<DailyData>{
  const member=ctx.member;if(!member)return {tasks:[],items:[],shopping:[],expiredTasks:[]};
  const [tasks,items,recurring,shopping,expiredTasks]=await Promise.all([
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
    ctx.env.DB.prepare(`SELECT s.*,t.title AS task_title,
      (SELECT GROUP_CONCAT(am.name,'、') FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=s.id) AS assignees
      FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
      WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')})
        AND ((s.due_date IS NOT NULL AND s.due_date=?) OR (s.due_date IS NULL AND s.task_id IS NULL))
      ORDER BY s.status,(s.due_date IS NULL),s.due_date,s.category,s.name,s.id`).bind(member.family_id,member.id,date).all<Row>(),
    expiredTasksFor(ctx),
  ]);
  return {
    tasks:[...tasks.results,...recurring].sort((a,b)=>String(a.start_at||a.due_at).localeCompare(String(b.start_at||b.due_at))),
    items:items.results,
    shopping:shopping.results,
    expiredTasks,
  };
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

function renderDailyPage(ctx:AppContext,date:string,data:DailyData,tomorrow:boolean,unorganized:Row[]=[]):string{
  const csrf=ctx.session.csrfToken??'';
  const shoppingByTask=new Map<number,Row[]>();
  const itemsByTask=new Map<number,Row[]>();
  for(const item of data.shopping){const tid=Number(item.task_id||0);if(tid){const list=shoppingByTask.get(tid)||[];list.push(item);shoppingByTask.set(tid,list);}}
  for(const item of data.items){const tid=Number(item.task_id||0);if(tid){const list=itemsByTask.get(tid)||[];list.push(item);itemsByTask.set(tid,list);}}
  const safeDailyProductUrl=(value:unknown)=>{const raw=String(value||'').trim();if(!raw||raw.length>2048)return '';try{const parsed=new URL(raw);if(parsed.username||parsed.password)return '';return parsed.protocol==='http:'||parsed.protocol==='https:'?parsed.href:'';}catch{return '';}};
  const shoppingRows=(items:Row[])=>items.map(item=>{const productUrl=safeDailyProductUrl(item.url);return `<div class="linked-shopping-row"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="shopping" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}">${productUrl?`<a href="${esc(productUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.name)}</a>`:`<a href="/app/shopping_edit.php?id=${item.id}">${esc(item.name)}</a>`}${item.quantity&&item.quantity!=='1'?` × ${esc(item.quantity)}`:''}</span></label><div class="meta">${[item.category||'',item.assignees?'担当 '+item.assignees:'',item.due_date?'期限 '+item.due_date:''].filter(Boolean).map(esc).join(' ・ ')}${productUrl?` ・ <a href="${esc(productUrl)}" target="_blank" rel="noopener noreferrer">商品ページ</a>`:''}</div></div>`;}).join('');
  const rows=data.tasks.map(task=>{
    const templateId=Number(task.task_id||0)||Math.abs(Number(task.id));
    const linkedShopping=shoppingByTask.get(templateId)||shoppingByTask.get(Math.abs(Number(task.id)))||[];
    const linkedItems=itemsByTask.get(templateId)||itemsByTask.get(Math.abs(Number(task.id)))||[];
    const taskShopping=linkedShopping.length?`<details class="task-shopping"><summary>🛒 買い物 ${linkedShopping.length}件</summary>${shoppingRows(linkedShopping)}</details>`:'';
    const itemRows=linkedItems.map(item=>`<div class="linked-shopping-row"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}">🎒 ${esc(item.name)}</span></label></div>`).join('');
    const childItems=linkedItems.length?`<details class="task-shopping"><summary>🎒 持ち物 ${linkedItems.length}件</summary>${itemRows}</details>`:'';
    const shoppingAdd=`<a class="task-shopping-add" href="/app/shopping_new.php?date=${encodeURIComponent(date)}&task_id=${templateId}" aria-label="このタスクに買い物を追加" title="買い物を追加"><span aria-hidden="true">🛒</span><span class="shopping-plus-badge" aria-hidden="true">＋</span></a>`;
    const shoppingBlock=taskShopping||childItems?`<div class="task-children">${taskShopping}${childItems}</div>`:'';
    const isEvent=String(task.task_kind||'').toLowerCase()==='event';
    const privateBadge=String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':'';
    const titleHtml=Number(task.id)<0?`<span>${esc(task.title)} <small>(定期)</small></span>`:`${privateBadge}<a href="/task/view.php?id=${task.id}">${isEvent?'📌 ':''}${esc(task.title)}</a>`;
    const mainHtml=isEvent?`<div class="task-main event-main"><span>${titleHtml} <small>(イベント)</small></span>${shoppingAdd}</div>`:`<div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="${Number(task.id)<0?'recurrence':'task'}" data-id="${esc(task.id)}" ${Number(task.id)<0?`data-occurrence-id="${esc(task.recurrence_occurrence_id)}"`:''} ${task.status==='completed'?'checked':''}><span class="${task.status==='completed'?'done':''}">${titleHtml}</span></label>${shoppingAdd}</div>`;
    const familyLogAction=Number(task.id)<0&&Number(task.family_log_template_id||0)?`<button type="button" class="btn small secondary occurrence-family-log" data-occurrence-id="${esc(task.recurrence_occurrence_id)}">🐣 記録して完了</button>`:'';
    return `<div class="row task-row ${isEvent?'event-task-row':''}">${mainHtml}<div class="meta">${esc(task.assignees||'')}${task.start_at?' ・ '+esc(String(task.start_at).slice(11,16)):task.due_at?' ・ '+(String(task.due_at).slice(11,16)==='00:00'?'終日':esc(String(task.due_at).slice(11,16))):''}${task.location?' ・ '+esc(task.location):''}</div>${familyLogAction}${shoppingBlock}</div>`;
  }).join('');
  const standaloneItems=data.items.filter(item=>!Number(item.task_id||0));
  const itemRows=standaloneItems.map(item=>`<div class="row"><label style="display:flex;gap:10px;align-items:center"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}"><a href="/item/edit.php?id=${item.id}">${esc(item.name)}</a></span></label><div class="meta">${item.assignees?'担当 '+esc(item.assignees):''}</div></div>`).join('');
  const unlinkedShopping=data.shopping.filter(item=>!Number(item.task_id||0));
  const unlinkedShoppingHtml=unlinkedShopping.length?`<div class="card section-card unlinked-shopping-section"><details><summary>🛒 その他の買い物（${unlinkedShopping.length}件）</summary>${shoppingRows(unlinkedShopping)}</details></div>`:'';
  const unorganizedHtml=unorganized.length?`<div class="card section-card unorganized-section"><div class="section-head"><h2>📋 未整理</h2><span class="meta">期限なし ${unorganized.length}件</span></div>${unorganized.map(task=>`<div class="row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="task" data-id="${task.id}"><span><a href="/task/view.php?id=${task.id}">${esc(task.title)}</a></span></label><div class="meta">${esc(task.assignees||'')}</div></div>`).join('')}<a class="btn small secondary" href="/task/new.php?date=">＋ 未整理タスクを追加</a></div>`:'';
  const expiredHtml=data.expiredTasks.length?`<details class="card expired-tasks"><summary>⚠️ 期限切れタスク ${data.expiredTasks.length}件</summary><div class="expired-list">${data.expiredTasks.map(task=>`<div class="expired-row" data-expired-task-id="${esc(task.id)}"><label class="expired-task-main"><input class="check toggle expired-checkbox" type="checkbox" data-type="task" data-id="${esc(task.id)}"><span>${String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':''}<a href="/task/view.php?id=${esc(task.id)}">${esc(task.title)}</a></span></label><div class="expired-meta">期限 ${esc(String(task.end_at||task.due_at||task.start_at).slice(0,10))} ・ 担当 ${esc(task.assignees||'未設定')}${task.location?' ・ '+esc(task.location):''}</div></div>`).join('')}</div></details>`:'';
  const cursor=new Date(`${date}T12:00:00Z`);cursor.setUTCDate(cursor.getUTCDate()-1);const prev=cursor.toISOString().slice(0,10);cursor.setUTCDate(cursor.getUTCDate()+2);const next=cursor.toISOString().slice(0,10);
  const pageTitle=tomorrow?'明日の準備':'今日';
  const basePath=tomorrow?'/tomorrow.php':'/today.php';
  const heading=tomorrow?'🌙 明日の準備':'☀️ 今日';
  const body=`<div class="daily-head"><div><div class="eyebrow">Family TODO LINE</div><h1>${heading}</h1><div class="date-title">${esc(date)}</div><div class="meta">${esc(ctx.member?.name||'')}</div></div><div class="date-nav"><a class="btn gray" href="${basePath}?date=${prev}">‹</a><a class="btn gray" href="${basePath}?date=${next}">›</a></div></div><div class="card section-card task-section"><div class="section-head"><h2>📝 タスク</h2><a class="btn small" href="/task/new.php?date=${encodeURIComponent(date)}">＋ 追加</a></div>${rows||'<p class="empty">対象日のタスク・イベントはありません。</p>'}</div>${unorganizedHtml}${expiredHtml}<div class="card section-card item-section"><div class="section-head"><h2>🎒 持ち物</h2><a class="btn small" href="/item/new.php?date=${encodeURIComponent(date)}">＋ 追加</a></div>${itemRows||'<p class="empty">対象日の持ち物はありません。</p>'}</div>${unlinkedShoppingHtml}<script type="application/json" id="dailyPayload">${JSON.stringify({csrf}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/task-events.js?v=${APP_VERSION}"></script><script src="/assets/occurrence-family-log.js?v=${APP_VERSION}"></script>`;
  return layout(pageTitle,body,basePath);
}

async function dailyPage(request:Request,ctx:AppContext,targetDate:string,tomorrow:boolean):Promise<Response>{
  if(!ctx.member){const url=new URL(request.url);return redirect(`/login.php?next=${encodeURIComponent(url.pathname+url.search)}`);}
  const safeDate=/^\d{4}-\d{2}-\d{2}$/.test(targetDate)?targetDate:dateOnly();
  const [data,unorganized]=await Promise.all([makeDailyData(ctx,safeDate),unorganizedTasksFor(ctx)]);
  return html(renderDailyPage(ctx,safeDate,data,tomorrow,unorganized));
}

export async function today(request:Request,ctx:AppContext,targetDate:string):Promise<Response>{return dailyPage(request,ctx,targetDate,false);}
export async function tomorrow(request:Request,ctx:AppContext,targetDate:string):Promise<Response>{return dailyPage(request,ctx,targetDate,true);}
