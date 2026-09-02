import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { commitSession } from './session';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';
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

/** Canonical Shopping page/API ownership retained independently from the legacy app.ts monolith. */
export async function shopping(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);

  if(request.method==='POST'){
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
  }

  const url=new URL(ctx.request.url);
  const view=url.searchParams.get('view')==='date'?'date':'category';
  const cat=url.searchParams.get('category')||'';
  const dueFilter=url.searchParams.get('due')||'all';
  const assigneeId=Number(url.searchParams.get('assignee')||0)||0;
  const where:string[]=['s.family_id=?',taskChildVisibilitySql('s')];
  const params:any[]=[m.family_id,m.id];
  if(cat){where.push('s.category=?');params.push(cat);}
  if(dueFilter==='none')where.push('s.due_date IS NULL AND s.task_id IS NULL');
  else if(dueFilter==='has')where.push('(s.due_date IS NOT NULL OR s.task_id IS NOT NULL)');
  if(assigneeId){where.push('EXISTS(SELECT 1 FROM shopping_assignees za WHERE za.shopping_item_id=s.id AND za.member_id=?)');params.push(assigneeId);}

  const rows=await ctx.env.DB.prepare(`SELECT s.*,t.title task_title,t.status task_status,t.start_at task_start_at,t.end_at task_end_at,t.due_at task_due_at,(SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id) assignees FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE ${where.join(' AND ')} ORDER BY s.status,(s.due_date IS NULL),s.due_date,s.category,s.name,s.id`).bind(...params).all<Row>();
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const categories=await ctx.env.DB.prepare(`SELECT DISTINCT s.category FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} AND s.category IS NOT NULL AND s.category<>'' ORDER BY s.category`).bind(m.family_id,m.id).all<Row>();
  const expired=await ctx.env.DB.prepare(`SELECT s.*,t.title task_title,t.status task_status,t.start_at task_start_at,t.end_at task_end_at,t.due_at task_due_at FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} AND s.status<>'completed' AND ((s.due_date IS NOT NULL AND s.due_date < ?) OR (s.task_id IS NOT NULL AND EXISTS(SELECT 1 FROM tasks pt WHERE pt.id=s.task_id AND pt.family_id=s.family_id AND (pt.status='completed' OR date(COALESCE(pt.end_at,pt.start_at,pt.due_at)) < ?)))) ORDER BY COALESCE(s.due_date,substr(COALESCE(t.end_at,t.start_at,t.due_at),1,10)),s.id`).bind(m.family_id,m.id,dateOnly(),dateOnly()).all<Row>();

  const groups=new Map<string,Row[]>();
  for(const row of rows.results){
    const key=view==='date'?(String(row.due_date||row.task_start_at||row.task_due_at||'').slice(0,10)||'期限なし'):String(row.category||'カテゴリーなし');
    const list=groups.get(key)||[];list.push(row);groups.set(key,list);
  }
  const detailRows=[...expired.results,...rows.results];
  const shoppingDetail=Object.fromEntries(detailRows.map(row=>[String(row.id),{
    id:Number(row.id),name:String(row.name||''),quantity:String(row.quantity||'1'),category:String(row.category||''),
    memo:String(row.memo||''),due_date:String(row.due_date||''),task_id:Number(row.task_id||0),
    task_title:String(row.task_title||''),assignees:String(row.assignees||''),url:String(row.url||''),status:String(row.status||'pending'),
  }]));
  const renderRow=(row:Row)=>`<div class="shopping-row compact-shopping-row" data-shopping-id="${row.id}">
    <label class="shopping-check-only" aria-label="${esc(row.name)}を完了にする"><input class="shop-toggle" type="checkbox" data-id="${row.id}" ${row.status==='completed'?'checked':''}></label>
    <button type="button" class="shopping-name-button ${row.status==='completed'?'done':''}" data-id="${row.id}">
      <span class="shopping-name-text">${esc(row.name)}</span>${row.quantity&&row.quantity!=='1'?`<span class="shopping-qty">×${esc(row.quantity)}</span>`:''}
    </button>
  </div>`;
  let listHtml='';
  for(const [group,items] of groups){
    const pending=items.filter(row=>row.status!=='completed'),done=items.filter(row=>row.status==='completed');
    listHtml+=`<div class="card shopping-group-card"><div class="group-title">${esc(group)} <span class="meta">${items.length}件</span></div>${pending.map(renderRow).join('')}${done.length?`<details class="shopping-completed"><summary>完了済み ${done.length}件</summary>${done.map(renderRow).join('')}</details>`:''}</div>`;
  }
  const filterActive=view==='date'||Boolean(cat)||dueFilter!=='all'||Boolean(assigneeId);
  const filterSummary=[view==='date'?'日付別':'カテゴリー別',cat?`カテゴリー：${cat}`:'',dueFilter==='has'?'期限あり':dueFilter==='none'?'期限なし':'',assigneeId?`担当：${String(members.results.find(row=>Number(row.id)===assigneeId)?.name||'指定')}`:''].filter(Boolean).join(' ・ ');
  const body=`<div class="page-head shopping-page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>🛒 買い物</h1></div></div>
  <details class="card shopping-filter-panel" ${filterActive?'open':''}><summary><span>表示・絞り込み</span><span class="shopping-filter-summary">${esc(filterSummary)}</span></summary><form class="filter-grid" method="get"><select name="view"><option value="category" ${view==='category'?'selected':''}>カテゴリー別</option><option value="date" ${view==='date'?'selected':''}>日付別</option></select><select name="category"><option value="">カテゴリー：すべて</option>${categories.results.map(row=>`<option value="${esc(row.category)}" ${cat===String(row.category)?'selected':''}>${esc(row.category)}</option>`).join('')}</select><select name="due"><option value="all" ${dueFilter==='all'?'selected':''}>期限：すべて</option><option value="has" ${dueFilter==='has'?'selected':''}>期限あり</option><option value="none" ${dueFilter==='none'?'selected':''}>期限なし</option></select><select name="assignee"><option value="0">担当者：すべて</option>${members.results.map(row=>`<option value="${row.id}" ${assigneeId===Number(row.id)?'selected':''}>${esc(row.name)}</option>`).join('')}</select><button class="btn" type="submit">適用</button></form></details>
  ${listHtml||'<div class="card"><p class="empty">買い物はありません。</p></div>'}
  ${expired.results.length?`<div class="card expired-card"><details><summary class="expired-trigger">期限切れ（${expired.results.length}件）</summary>${expired.results.map(row=>`<button type="button" class="expired-row shopping-detail-open" data-id="${row.id}"><strong>${esc(row.name)}${row.quantity&&row.quantity!=='1'?' × '+esc(row.quantity):''}</strong><span class="expired-meta">${row.task_title?'タスク：'+esc(row.task_title):'タスクなし'}${row.due_date?' ・ 期限：'+esc(row.due_date):''}</span></button>`).join('')}</details></div>`:''}
  <a class="fab shopping-fab" href="/app/shopping_new.php?date=${dateOnly()}" aria-label="買い物を追加">＋</a>
  <div class="shopping-detail-backdrop" id="shoppingDetailModal" aria-hidden="true"><div class="shopping-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="shoppingDetailTitle"><div class="shopping-detail-head"><h2 id="shoppingDetailTitle">買い物詳細</h2><button type="button" class="shopping-detail-close" id="shoppingDetailClose" aria-label="閉じる">×</button></div><div id="shoppingDetailBody" class="shopping-detail-body"></div><div class="shopping-detail-actions"><a class="btn gray" id="shoppingDetailEdit" href="#">編集</a><button type="button" class="btn gray" id="shoppingDetailToTask">タスク化</button></div></div></div>
  <script type="application/json" id="shoppingPayload">${JSON.stringify({shoppingDetail,csrf:ctx.session.csrfToken??''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/shopping.js?v=${APP_VERSION}"></script>`;
  return html(layout('買い物',body,'/app/shopping.php'));
}
