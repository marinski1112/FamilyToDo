import { checklistCompletionSql, completionVisible, nextCompletionBoundary } from './checklist-completion';
import { goodsVisibilitySql } from './goods-visibility';
import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { expiredShoppingPageFor, overdueShoppingCursorFromRow, OVERDUE_SHOPPING_PAGE_SIZE, renderOverdueShoppingRows, type OverdueShoppingCursor } from './overdue-shopping';
import { recurringForDate } from './recurrence-projection';
import { html, json, redirect } from './response';
import { taskVisibilitySql } from './task-visibility';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;
type OverdueTaskCursor={due:string;id:number};

type TaskEventsData={tasks:Row[];items:Row[];shopping:Row[];expiredTasks:Row[];expiredShopping:Row[]};

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(d);
const isRealDateOnly=(value:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};
const compareShoppingRows=(a:Row,b:Row)=>{
  const status=String(a.status??'').localeCompare(String(b.status??''));if(status)return status;
  const nullDue=Number(a.due_date==null)-Number(b.due_date==null);if(nullDue)return nullDue;
  for(const key of ['due_date','category','name'] as const){const diff=String(a[key]??'').localeCompare(String(b[key]??''));if(diff)return diff;}
  return Number(a.id||0)-Number(b.id||0);
};
const taskListColumns='t.id,t.title,t.status,t.due_at,t.start_at,t.end_at,t.location,t.visibility_scope,t.parent_task_id,t.sort_order,t.task_kind,t.completed_at,t.updated_at,t.created_at';
const OVERDUE_TASK_PAGE_SIZE=50;

async function undatedChildrenFor(ctx:AppContext,parentIds:number[],pendingOnly=false):Promise<Row[]>{
  const member=ctx.member;if(!member||!parentIds.length)return [];
  const statusSql=pendingOnly?"t.status='pending'":"t.status IN ('pending','completed')";
  return (await ctx.env.DB.prepare(`SELECT ${taskListColumns},
      (SELECT GROUP_CONCAT(am.name,'、') FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id) AS assignees
    FROM tasks t
    WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND ${statusSql} AND ${checklistCompletionSql('t')}
      AND t.parent_task_id IN (${parentIds.map(()=>'?').join(',')})
      AND (t.task_kind IS NULL OR lower(t.task_kind)<>'event')
      AND t.start_at IS NULL AND t.end_at IS NULL AND t.due_at IS NULL
    ORDER BY t.parent_task_id,t.sort_order,t.id`).bind(member.family_id,member.id,...parentIds).all<Row>()).results;
}

async function expiredTaskPageFor(ctx:AppContext,date:string,cursor?:OverdueTaskCursor):Promise<Row[]>{
  const member=ctx.member;if(!member)return [];
  const cursorSql=cursor?' AND (COALESCE(t.end_at,t.due_at,t.start_at),t.id) > (?,?)':'';
  const bindings:unknown[]=[member.family_id,member.id,date];
  if(cursor)bindings.push(cursor.due,cursor.id);
  return (await ctx.env.DB.prepare(`SELECT t.id,t.title,t.status,t.due_at,t.start_at,t.end_at,t.location,t.visibility_scope,
      COALESCE(t.end_at,t.due_at,t.start_at) AS effective_due,
      (SELECT GROUP_CONCAT(am.name,'、') FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id) AS assignees
    FROM tasks t WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending'
      AND (t.task_kind IS NULL OR lower(t.task_kind)='task')
      AND COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL
      AND date(COALESCE(t.end_at,t.due_at,t.start_at)) < date(?)${cursorSql}
    ORDER BY COALESCE(t.end_at,t.due_at,t.start_at),t.id
    LIMIT ${OVERDUE_TASK_PAGE_SIZE+1}`).bind(...bindings).all<Row>()).results;
}

async function expiredTasksFor(ctx:AppContext,date:string):Promise<Row[]>{
  return expiredTaskPageFor(ctx,date);
}

async function unorganizedTasksFor(ctx:AppContext):Promise<Row[]>{
  const member=ctx.member;if(!member)return [];
  const roots=(await ctx.env.DB.prepare(`SELECT ${taskListColumns},t.description,t.created_at,t.created_by,
      (SELECT GROUP_CONCAT(am.name,'、') FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id) AS assignees
    FROM tasks t
    WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending'
      AND (t.task_kind IS NULL OR lower(t.task_kind)<>'event')
      AND t.parent_task_id IS NULL
      AND t.start_at IS NULL AND t.end_at IS NULL AND t.due_at IS NULL
    ORDER BY t.sort_order,t.id DESC LIMIT 50`).bind(member.family_id,member.id).all<Row>()).results;
  const rootIds=roots.map(row=>Number(row.id||0)).filter(id=>Number.isInteger(id)&&id>0);
  const children=await undatedChildrenFor(ctx,rootIds,true);
  return [...roots,...children];
}

async function makeTaskEventsData(ctx:AppContext,date:string):Promise<TaskEventsData>{
  const member=ctx.member;if(!member)return {tasks:[],items:[],shopping:[],expiredTasks:[],expiredShopping:[]};
  const [tasks,items,recurring,expiredTasks,expiredShopping]=await Promise.all([
    ctx.env.DB.prepare(`SELECT t.*,
      (SELECT GROUP_CONCAT(am.name,'、') FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id) AS assignees
      FROM tasks t
      WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status IN ('pending','completed')
        AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template'))
        AND (
          (t.status='completed' AND lower(COALESCE(t.task_kind,''))<>'event' AND ${checklistCompletionSql('t')}) OR
          (lower(COALESCE(t.task_kind,''))='event' AND (
            (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND date(COALESCE(t.end_at,t.start_at))>=date(?))
            OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?))
          ))
          OR (lower(COALESCE(t.task_kind,''))<>'event' AND (
            (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND date(COALESCE(t.end_at,t.due_at,t.start_at))>=date(?))
            OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?))
          ))
        )
      ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id`).bind(member.family_id,member.id,date,date,date,date,date,date).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*
      FROM items i
      WHERE i.family_id=? AND ${goodsVisibilitySql('i')} AND ${checklistCompletionSql('i')}
        AND ((i.due_at IS NOT NULL AND date(i.due_at)=date(?)) OR i.status='completed')
      ORDER BY i.due_at,i.status,i.id`).bind(member.family_id,member.id,date).all<Row>(),
    (async()=>{
      const selected=await recurringForDate(ctx,date);
      if(new Date(Date.now()+9*3600000).getUTCHours()!==0)return selected;
      const previous=new Date(`${date}T00:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);
      const prior=await recurringForDate(ctx,previous.toISOString().slice(0,10));
      const ids=new Set(selected.map(row=>Number(row.id)));
      return [...selected,...prior.filter(row=>!ids.has(Number(row.id))&&row.status==='completed'&&completionVisible(row))];
    })(),
    expiredTasksFor(ctx,date),
    expiredShoppingPageFor(ctx,date),
  ]);
  const rootIds=[...new Set<number>(tasks.results.filter(row=>Number(row.id||0)>0&&!Number(row.parent_task_id||0)).map(row=>Number(row.id)))];
  const undatedChildren=await undatedChildrenFor(ctx,rootIds);
  const taskById=new Map<number,Row>();
  for(const row of [...tasks.results,...undatedChildren]){const id=Number(row.id||0);if(id>0)taskById.set(id,row);}
  const taskRows=[...taskById.values(),...recurring].sort((a,b)=>String(a.start_at||a.due_at).localeCompare(String(b.start_at||b.due_at))||Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id||0)-Number(b.id||0));
  const baseShopping=await ctx.env.DB.prepare(`SELECT s.*
      FROM shopping_items s
      WHERE s.family_id=? AND ${goodsVisibilitySql('s')}
        AND ${checklistCompletionSql('s')}
        AND ((s.due_date IS NOT NULL AND date(s.due_date)>=date(?)) OR s.due_date IS NULL OR s.status='completed')
      ORDER BY s.status,(s.due_date IS NULL),s.due_date,s.category,s.name,s.id`)
    .bind(member.family_id,member.id,date).all<Row>();
  const expiredShoppingIds=new Set(expiredShopping.map(row=>String(row.id)));
  const shoppingById=new Map<string,Row>();
  for(const row of baseShopping.results)if(!expiredShoppingIds.has(String(row.id)))shoppingById.set(String(row.id),row);
  const shopping=[...shoppingById.values()].sort(compareShoppingRows);
  return {tasks:taskRows.filter(row=>String(row.task_kind||'').toLowerCase()==='event'||completionVisible(row)),items:items.results,shopping,expiredTasks,expiredShopping};
}

const renderExpiredTaskRows=(tasks:Row[])=>tasks.map(task=>`<div class="expired-row" data-expired-task-id="${esc(task.id)}"><div class="checklist-row-line"><label class="expired-task-main"><input class="check toggle expired-checkbox" type="checkbox" data-type="task" data-id="${esc(task.id)}"><span>${String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':''}${esc(task.title)}</span></label><a class="checklist-row-action" href="/task/view.php?id=${esc(task.id)}" aria-label="${esc(task.title)}の詳細">詳細</a></div><div class="expired-meta">期限 ${esc(String(task.end_at||task.due_at||task.start_at).slice(0,10))} ・ 担当 ${esc(task.assignees||'未設定')}${task.location?' ・ '+esc(task.location):''}</div></div>`).join('');

function renderTaskEventsPage(ctx:AppContext,date:string,data:TaskEventsData,unorganized:Row[]):string{
  const csrf=ctx.session.csrfToken??'';
  const safeProductUrl=(value:unknown)=>{const raw=String(value||'').trim();if(!raw||raw.length>2048)return '';try{const parsed=new URL(raw);if(parsed.username||parsed.password)return '';return parsed.protocol==='http:'||parsed.protocol==='https:'?parsed.href:'';}catch{return '';}};
  const effectiveShoppingDue=(item:Row)=>String(item.due_date||'').slice(0,10);
  const shoppingRows=(items:Row[])=>{
    const groups=new Map<string,{title:string;due:string;items:Row[]}>();
    for(const item of items){
      const due=effectiveShoppingDue(item);
      const key=`item:${String(item.id)}`;
      const group=groups.get(key)||{title:'',due,items:[]};
      group.items.push(item);groups.set(key,group);
    }
    return [...groups.values()].map(group=>{
      const groupHead=group.title?`<div class="shopping-group-head"><strong>${esc(group.title)}</strong>${group.due?`<span class="meta">${esc(group.due)}</span>`:''}</div>`:'';
      const rows=group.items.map(item=>{
        const productUrl=safeProductUrl(item.url);
        return `<div class="row linked-shopping-row" data-category="${esc(item.category||'')}"><div class="checklist-row-line"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="shopping" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}">${esc(item.name)}${item.quantity&&item.quantity!=='1'?` × ${esc(item.quantity)}`:''}</span></label><a class="checklist-row-action" href="/app/shopping_edit.php?id=${esc(item.id)}" aria-label="${esc(item.name)}を編集">編集</a></div>${productUrl?`<div class="meta"><a href="${esc(productUrl)}" target="_blank" rel="noopener noreferrer">商品ページ</a></div>`:''}</div>`;
      }).join('');
      return `<div class="shopping-group">${groupHead}${rows}</div>`;
    }).join('');
  };

  const taskById=new Map<number,Row>();
  for(const task of data.tasks){const id=Number(task.id||0);if(id>0)taskById.set(id,task);}
  const childTasksByParent=new Map<number,Row[]>();
  const rootTasks:Row[]=[];
  for(const task of data.tasks){
    const id=Number(task.id||0),parentId=Number(task.parent_task_id||0);
    if(id>0&&parentId>0&&taskById.has(parentId)){const list=childTasksByParent.get(parentId)||[];list.push(task);childTasksByParent.set(parentId,list);}
    else rootTasks.push(task);
  }
  for(const list of childTasksByParent.values())list.sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id||0)-Number(b.id||0));

  const unorganizedById=new Map<number,Row>();
  for(const task of unorganized){const id=Number(task.id||0);if(id>0)unorganizedById.set(id,task);}
  const unorganizedChildrenByParent=new Map<number,Row[]>();
  const unorganizedRoots:Row[]=[];
  for(const task of unorganized){
    const id=Number(task.id||0),parentId=Number(task.parent_task_id||0);
    if(id>0&&parentId>0&&unorganizedById.has(parentId)){const list=unorganizedChildrenByParent.get(parentId)||[];list.push(task);unorganizedChildrenByParent.set(parentId,list);}
    else unorganizedRoots.push(task);
  }
  for(const list of unorganizedChildrenByParent.values())list.sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id||0)-Number(b.id||0));

  const taskMeta=(task:Row)=>{const parts:string[]=[];const start=String(task.start_at||'').slice(11,16),due=String(task.due_at||'').slice(11,16);if(start&&start!=='00:00')parts.push(esc(start));else if(!start&&due&&due!=='00:00')parts.push(esc(due));if(task.location)parts.push(esc(task.location));return parts.join(' ・ ');};
  const childComposer=(task:Row,hidden=false)=>`<form class="task-child-composer" data-parent-task-id="${esc(task.id)}" data-parent-private="${String(task.visibility_scope)==='PRIVATE'?'1':'0'}"${hidden?' hidden':''}><div class="task-child-composer-line"><span class="task-child-branch" aria-hidden="true">└</span><input class="task-child-title" type="text" maxlength="255" autocomplete="off" enterkeyhint="done" placeholder="子タスクを追加" aria-label="子タスクを追加"><button class="btn small secondary task-child-add" type="submit">追加</button></div><div class="task-child-status" role="status" aria-live="polite"></div></form>`;
  const renderChildTask=(task:Row)=>{
    const privateBadge=String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':'';
    return `<div class="row task-child-row" data-task-id="${esc(task.id)}"><div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="task" data-id="${esc(task.id)}" ${task.status==='completed'?'checked':''}><span class="${task.status==='completed'?'done':''}">${privateBadge}${esc(task.title)}</span></label><div class="checklist-row-actions"><a class="checklist-row-action" href="/task/view.php?id=${esc(task.id)}" aria-label="${esc(task.title)}の詳細">詳細</a></div></div><div class="meta">${taskMeta(task)}</div></div>`;
  };
  const renderRootTask=(task:Row)=>{
    const taskId=Number(task.id||0),isEvent=String(task.task_kind||'').toLowerCase()==='event',storedChild=Number(task.parent_task_id||0)>0;
    const privateBadge=String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':'';
    const titleHtml=taskId<0?`<span>${esc(task.title)} <small>(定期)</small></span>`:`${privateBadge}${isEvent?`<a href="/task/view.php?id=${task.id}">📌 ${esc(task.title)}</a>`:esc(task.title)}`;
    const detailAction=!isEvent&&taskId>=0?`<a class="checklist-row-action" href="/task/view.php?id=${task.id}" aria-label="${esc(task.title)}の詳細">詳細</a>`:'';
    const mainHtml=isEvent?`<div class="task-main event-main"><span>${titleHtml} <small>(イベント)</small></span></div>`:`<div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="${taskId<0?'recurrence':'task'}" data-id="${esc(task.id)}" ${taskId<0?`data-occurrence-id="${esc(task.recurrence_occurrence_id)}"`:''} ${task.status==='completed'?'checked':''}><span class="${task.status==='completed'?'done':''}">${titleHtml}</span></label><div class="checklist-row-actions">${detailAction}</div></div>`;
    const familyLogAction=taskId<0&&Number(task.family_log_template_id||0)?`<button type="button" class="btn small secondary occurrence-family-log" data-occurrence-id="${esc(task.recurrence_occurrence_id)}">🐣 記録して完了</button>`:'';
    const children=taskId>0?(childTasksByParent.get(taskId)||[]):[];
    const childRows=children.map(child=>renderChildTask(child)).join('');
    const composer=taskId>0&&!isEvent&&!storedChild?childComposer(task,task.status==='completed'):'';
    const childSection=childRows||composer?`<div class="task-children" data-parent-task-id="${esc(task.id)}">${childRows}${composer}</div>`:'';
    return `<div class="row task-row ${isEvent?'event-task-row':''}" data-task-id="${esc(task.id)}" data-task-private="${String(task.visibility_scope)==='PRIVATE'?'1':'0'}">${mainHtml}<div class="meta">${taskMeta(task)}</div>${familyLogAction}${childSection}</div>`;
  };
  const taskRows=rootTasks.map(renderRootTask).join('');

  const renderItemRow=(item:Row)=>`<div class="row"><div style="display:flex;gap:10px;align-items:center"><label style="display:flex;gap:10px;align-items:center;min-width:0"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}">${esc(item.name)}</span></label><a href="/item/edit.php?id=${esc(item.id)}" aria-label="${esc(item.name)}を編集" style="margin-left:auto;white-space:nowrap">編集</a></div></div>`;
  const standaloneItems=data.items;
  const itemRows=standaloneItems.map(renderItemRow).join('');
  const itemContent=itemRows;
  const unorganizedHtml=unorganizedRoots.length?`<div class="card section-card unorganized-section"><div class="section-head"><h2>📋 未整理</h2><span class="meta">期限なし ${unorganized.length}件</span></div>${unorganizedRoots.map(task=>{
    const privateBadge=String(task.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':'';
    const children=unorganizedChildrenByParent.get(Number(task.id||0))||[];
    const childRows=children.map(child=>renderChildTask(child)).join('');
    const composer=childComposer(task,false);
    return `<div class="row unorganized-task-row" data-task-id="${esc(task.id)}" data-task-private="${String(task.visibility_scope)==='PRIVATE'?'1':'0'}"><div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="task" data-id="${esc(task.id)}"><span>${privateBadge}${esc(task.title)}</span></label><div class="checklist-row-actions"><a class="checklist-row-action" href="/task/view.php?id=${esc(task.id)}" aria-label="${esc(task.title)}の詳細">詳細</a></div></div><div class="meta">${esc(task.assignees||'')}</div><div class="task-children" data-parent-task-id="${esc(task.id)}">${childRows}${composer}</div></div>`;
  }).join('')}</div>`:'';
  const visibleExpiredTasks=data.expiredTasks.slice(0,OVERDUE_TASK_PAGE_SIZE);
  const expiredTaskHasMore=data.expiredTasks.length>OVERDUE_TASK_PAGE_SIZE;
  const lastExpiredTask=visibleExpiredTasks.at(-1);
  const expiredHtml=visibleExpiredTasks.length?`<details class="card expired-tasks" id="expired-tasks"><summary>⚠️ 期限切れタスク <span class="expired-task-count">${visibleExpiredTasks.length}件表示${expiredTaskHasMore?'（続きあり）':''}</span></summary><div class="expired-list">${renderExpiredTaskRows(visibleExpiredTasks)}</div>${expiredTaskHasMore&&lastExpiredTask?`<button type="button" class="btn secondary expired-task-more" data-cursor-due="${esc(lastExpiredTask.effective_due||lastExpiredTask.end_at||lastExpiredTask.due_at||lastExpiredTask.start_at)}" data-cursor-id="${esc(lastExpiredTask.id)}">続きを表示</button>`:''}</details>`:'';
  const visibleExpiredShopping=data.expiredShopping.slice(0,OVERDUE_SHOPPING_PAGE_SIZE);
  const expiredShoppingHasMore=data.expiredShopping.length>OVERDUE_SHOPPING_PAGE_SIZE;
  const lastExpiredShopping=visibleExpiredShopping.at(-1);
  const lastExpiredShoppingCursor=lastExpiredShopping?overdueShoppingCursorFromRow(lastExpiredShopping):null;
  const expiredShoppingHtml=visibleExpiredShopping.length?`<details class="card expired-shopping"><summary>⚠️ 期限切れ買い物 <span class="expired-shopping-count">${visibleExpiredShopping.length}件表示${expiredShoppingHasMore?'（続きあり）':''}</span></summary><div class="expired-shopping-list">${renderOverdueShoppingRows(visibleExpiredShopping)}</div>${expiredShoppingHasMore&&lastExpiredShoppingCursor?`<button type="button" class="btn secondary expired-shopping-more" data-cursor-due="${esc(lastExpiredShoppingCursor.due)}" data-cursor-category-present="${lastExpiredShoppingCursor.categoryPresent}" data-cursor-category="${esc(lastExpiredShoppingCursor.category)}" data-cursor-name="${esc(lastExpiredShoppingCursor.name)}" data-cursor-id="${lastExpiredShoppingCursor.id}">続きを表示</button>`:''}</details>`:'';
  const cursor=new Date(`${date}T12:00:00Z`);cursor.setUTCDate(cursor.getUTCDate()-1);const prev=cursor.toISOString().slice(0,10);cursor.setUTCDate(cursor.getUTCDate()+2);const next=cursor.toISOString().slice(0,10);
  const [year,month,day]=date.split('-');
  const compactDate=year&&month&&day?`${year}.${Number(month)}.${Number(day)}`:date;
  const taskSection=`<div class="card section-card task-section"><div class="section-head"><h2><span class="checklist-heading-icon" aria-hidden="true">✓</span>タスク・イベント</h2></div>${taskRows||'<p class="empty">対象日のタスク・イベントはありません。</p>'}</div>`;
  const shoppingSection=`<div class="card section-card shopping-checklist-section" id="shopping-checklist"><div class="section-head"><div><h2><span class="checklist-heading-icon shopping" aria-hidden="true">▣</span>買い物</h2></div></div>${shoppingRows(data.shopping)||'<p class="empty">対象日の買い物はありません。</p>'}<details class="checklist-more"><summary>表示ルール</summary><p class="meta">通常タスクは関連日から期限まで、定期タスクは期限日に表示</p></details></div>`;
  const overdueSection=`${expiredShoppingHtml}${expiredHtml}`;
  const itemSection=`<div class="card section-card item-section"><div class="section-head"><h2><span class="checklist-heading-icon belongings" aria-hidden="true">◆</span>持ち物</h2></div>${itemContent||'<p class="empty">対象日の持ち物はありません。</p>'}</div>`;
  const primarySections=[
    {priority:0,hasContent:Boolean(taskRows),html:taskSection},
    {priority:1,hasContent:data.shopping.length>0,html:shoppingSection},
    {priority:2,hasContent:Boolean(overdueSection),html:overdueSection},
    {priority:3,hasContent:Boolean(itemContent),html:itemSection},
  ].sort((a,b)=>Number(b.hasContent)-Number(a.hasContent)||a.priority-b.priority).map(section=>section.html).join('');
  const checklistStyle=`<style>
.checklist-page .daily-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.checklist-page .daily-head h1{font-size:19px!important;line-height:1.2;margin:0;white-space:nowrap;min-width:0}
.checklist-page .checklist-date{font-size:14px;font-weight:700;color:#64748b;margin-left:5px;font-variant-numeric:tabular-nums}
.checklist-page .date-nav{display:flex;gap:6px;flex-shrink:0}
.checklist-page .section-card{padding:12px!important;margin-bottom:12px}
.checklist-page .section-head{gap:8px;align-items:center;margin-bottom:6px}
.checklist-page .section-head>div:first-child,.checklist-page .section-head h2{min-width:0}
.checklist-page .section-head h2{font-size:17px!important;margin:0;line-height:1.4}
.checklist-page .section-head>a,.checklist-page .section-head>div:last-child{flex-shrink:0}
.checklist-page .section-head .btn,.checklist-page .date-nav .btn{min-height:44px;min-width:44px}
.checklist-page .checklist-row-line{display:flex;align-items:center;gap:8px}
.checklist-page .checklist-row-line>label{flex:1;min-width:0}
.checklist-page .checklist-row-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.checklist-page .checklist-row-action{display:inline-flex;align-items:center;min-height:34px;padding:0 6px;font-size:13px;font-weight:700;white-space:nowrap;text-decoration:none}
.checklist-page .task-children{margin:8px 0 0 30px;padding-left:12px;border-left:2px solid #e2e8f0}
.checklist-page .task-child-row{padding:7px 0}
.checklist-page .task-child-composer{margin-top:6px}
.checklist-page .task-child-composer-line{display:flex;align-items:center;gap:6px}
.checklist-page .task-child-branch{color:#94a3b8;flex:0 0 auto}
.checklist-page .task-child-title{flex:1;min-width:0;min-height:40px;border:0!important;border-bottom:1px solid #e2e8f0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;padding:0 4px!important;font:inherit}
.checklist-page .task-child-add{min-height:40px;white-space:nowrap}
.checklist-page .task-child-status{min-height:1.2em;margin-top:3px;font-size:12px;color:#64748b}
.checklist-page .empty{padding:0!important;margin:8px 0 2px!important;font-size:13px;line-height:1.5}
.checklist-page .checklist-more{margin-top:8px;border-top:1px solid #e2e8f0}
.checklist-page .checklist-more>summary{cursor:pointer;min-height:44px;box-sizing:border-box;padding:11px 0;font-size:13px;color:#475569}
.checklist-page .checklist-more .meta{font-size:13px;line-height:1.5;margin:8px 0 0}
@media(max-width:360px){.checklist-page .daily-head h1{font-size:18px!important}.checklist-page .checklist-date{font-size:13px;margin-left:3px}.checklist-page .date-nav{gap:4px}.checklist-page .date-nav .btn{min-width:40px;width:40px;padding-left:0;padding-right:0}.checklist-page .task-children{margin-left:20px;padding-left:8px}}
</style>`;
  const body=`<link rel="stylesheet" href="/assets/checklist-belongings-reusable-sets.css?v=${APP_VERSION}">${checklistStyle}<div class="checklist-page"><div class="daily-head"><h1>✅ チェックリスト <span class="checklist-date">${esc(compactDate)}</span></h1><div class="date-nav"><a class="btn gray" aria-label="前日を表示" href="/app/tasks.php?date=${prev}">‹</a><a class="btn gray" aria-label="翌日を表示" href="/app/tasks.php?date=${next}">›</a></div></div>${primarySections}${unorganizedHtml}</div><script type="application/json" id="dailyPayload">${JSON.stringify({csrf,date,appVersion:APP_VERSION,completionRefreshAt:nextCompletionBoundary()}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/task-events.js?v=${APP_VERSION}"></script><script src="/assets/overdue-shopping.js?v=${APP_VERSION}"></script><script src="/assets/occurrence-family-log.js?v=${APP_VERSION}"></script>`;
  return layout('チェックリスト',body,'/app/tasks.php');
}

/** Unified Task/Event + Shopping checklist page. Events are display-only rows. */
export async function taskEvents(_request:Request,ctx:AppContext,targetDate:string):Promise<Response>{
  const member=ctx.member;
  if(!member){const url=new URL(ctx.request.url);return redirect(`/login.php?next=${encodeURIComponent(url.pathname+url.search)}`);}
  const safeDate=isRealDateOnly(targetDate)?targetDate:dateOnly();
  const requestUrl=new URL(_request.url);
  if(requestUrl.searchParams.get('overdue')==='tasks'){
    const cursorDue=String(requestUrl.searchParams.get('cursor_due')||'').trim();
    const cursorId=Number(requestUrl.searchParams.get('cursor_id')||0);
    if(cursorDue.length>64||!Number.isSafeInteger(cursorId)||cursorId<=0)return json({ok:false,error:'期限切れタスクの続きを取得できませんでした。'},400);
    const pageRows=await expiredTaskPageFor(ctx,safeDate,{due:cursorDue,id:cursorId});
    const visible=pageRows.slice(0,OVERDUE_TASK_PAGE_SIZE);
    const hasMore=pageRows.length>OVERDUE_TASK_PAGE_SIZE;
    const last=visible.at(-1);
    return json({ok:true,html:renderExpiredTaskRows(visible),hasMore,cursor:last?{due:String(last.effective_due||last.end_at||last.due_at||last.start_at||''),id:Number(last.id||0)}:null});
  }
  if(requestUrl.searchParams.get('overdue')==='shopping'){
    const cursorDue=String(requestUrl.searchParams.get('cursor_due')||'').trim();
    const cursorCategoryPresent=Number(requestUrl.searchParams.get('cursor_category_present'));
    const cursorCategory=String(requestUrl.searchParams.get('cursor_category')||'');
    const cursorName=String(requestUrl.searchParams.get('cursor_name')||'');
    const cursorId=Number(requestUrl.searchParams.get('cursor_id')||0);
    if(!cursorDue||cursorDue.length>64||(cursorCategoryPresent!==0&&cursorCategoryPresent!==1)||cursorCategory.length>255||!cursorName||cursorName.length>2048||!Number.isSafeInteger(cursorId)||cursorId<=0)return json({ok:false,error:'期限切れ買い物の続きを取得できませんでした。'},400);
    const cursor:OverdueShoppingCursor={due:cursorDue,categoryPresent:cursorCategoryPresent as 0|1,category:cursorCategory,name:cursorName,id:cursorId};
    const pageRows=await expiredShoppingPageFor(ctx,safeDate,cursor);
    const visible=pageRows.slice(0,OVERDUE_SHOPPING_PAGE_SIZE);
    const hasMore=pageRows.length>OVERDUE_SHOPPING_PAGE_SIZE;
    const last=visible.at(-1);
    return json({ok:true,html:renderOverdueShoppingRows(visible),hasMore,cursor:last?overdueShoppingCursorFromRow(last):null});
  }
  const [data,unorganized]=await Promise.all([makeTaskEventsData(ctx,safeDate),unorganizedTasksFor(ctx)]);
  return html(renderTaskEventsPage(ctx,safeDate,data,unorganized));
}
