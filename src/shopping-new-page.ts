import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html, redirect } from './response';
import { taskVisibilitySql } from './task-visibility';
import { validateLiffNext } from './liff-target';
import { APP_VERSION } from './version';

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

function taskRange(task:Row):{start:string;end:string}{
  const start=String(task.start_at||task.due_at||'').slice(0,10);
  let end=String(task.end_at||task.start_at||task.due_at||'').slice(0,10);
  if(start&&end&&end<start)end=start;
  return {start,end};
}

function taskOverlapsDate(task:Row,date:string):boolean{
  if(!date)return false;
  const {start,end}=taskRange(task);
  return Boolean(start&&start<=date&&(!end||end>=date));
}

function taskOption(task:Row,selectedTaskId:number):string{
  const {start,end}=taskRange(task);
  const dateLabel=start?(end&&end!==start?`${start}〜${end}`:start):'期限なし';
  return `<option value="${task.id}" ${Number(task.id)===selectedTaskId?'selected':''}>${esc(task.title)}（${esc(dateLabel)}）</option>`;
}

function shoppingBatchForm(ctx:AppContext,tasks:Row[],date='',members:Row[]=[],selectedTaskId=0):string{
  const csrf=ctx.session.csrfToken??'';
  const defaultDate=esc(date);
  const selectedTask=tasks.find(t=>Number(t.id)===selectedTaskId),privateContext=String(selectedTask?.visibility_scope||'')==='PRIVATE';
  const initialTasks=tasks.filter(task=>Number(task.id)===selectedTaskId||taskOverlapsDate(task,date));
  const otherTaskCount=Math.max(0,tasks.length-initialTasks.length);
  const taskLinkPayload=JSON.stringify({
    selectedTaskId,
    tasks:tasks.map(task=>{
      const {start,end}=taskRange(task);
      return {id:Number(task.id),title:String(task.title||''),start,end,due:String(task.due_at||'').slice(0,10)};
    }),
  }).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  return `<div class="card form-card batch-shopping-card" id="addShopping">
    <div class="section-head"><h2>＋ 買い物を追加</h2><span class="meta">複数商品を一度に登録できます</span></div>
    <form id="shopBatchForm" class="compact-form">
      <input type="hidden" name="csrf" value="${esc(csrf)}">
      <div id="shoppingProducts">
        <div class="product-row batch-product" data-product-row><input type="text" name="product_name[]" maxlength="255" placeholder="商品名" required><input type="text" name="product_quantity[]" value="1" inputmode="text" placeholder="数量" aria-label="数量"><button type="button" class="product-url-toggle" aria-expanded="false">🔗</button><span class="product-row-spacer" aria-hidden="true"></span><div class="product-url-popover" hidden><div class="product-url-popover-head"><strong>商品URL</strong><button type="button" class="product-url-close" aria-label="URL入力を閉じる">×</button></div><input type="url" name="product_url[]" placeholder="https://..." aria-label="商品URL"><p class="small">商品ページのURLがある場合だけ入力してください。</p></div></div>
      </div>
      <button type="button" class="btn gray small add-product" id="addProduct">＋ 商品を追加</button>
      <div class="batch-common-settings">
        <label>カテゴリー（全商品共通）</label>
        <input name="category" list="shoppingCategories" placeholder="例：食品">
        <datalist id="shoppingCategories"><option value="食品"><option value="日用品"><option value="子供"><option value="薬・衛生"><option value="その他"></datalist>
        <label>期限（全商品共通）</label>
        <input type="date" name="due_date" id="shoppingTaskDueDate" value="${defaultDate}">
        <label>担当者（全商品共通）</label>
        ${privateContext?'<p class="notice">🔒 自分専用タスクのため、担当者はあなたのみです</p>':`<div class="assignee-list">${members.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div>`}
        <label>関連タスク（全商品共通）</label>
        ${privateContext?`<p class="notice">🔒 自分専用タスク: ${esc(selectedTask?.title)}</p><input type="hidden" name="task_id" value="${selectedTaskId}">`:`<select name="task_id" id="shoppingTaskId"><option value="0">タスクなし</option>${initialTasks.map(task=>taskOption(task,selectedTaskId)).join('')}</select><label class="checkrow"><input type="checkbox" id="shoppingTaskShowAll"><span>その他の未完了タスクも表示${otherTaskCount?`（${otherTaskCount}件）`:''}</span></label><p class="small" id="shoppingTaskHint">${date?`期限日に重なる未完了タスク ${initialTasks.filter(task=>taskOverlapsDate(task,date)).length}件を優先表示しています。`:'期限を指定すると、その日に重なる未完了タスクだけを先に表示します。'}</p>`}
        <label>メモ（全商品共通・任意）</label>
        <textarea name="memo" placeholder="例：低脂肪、○○店で購入"></textarea>
      </div>
      <button type="submit">まとめて登録する</button>
    </form>
  </div>
  <script type="application/json" id="shoppingNewPayload">${JSON.stringify({csrf}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script>
  ${privateContext?'':`<script type="application/json" id="shoppingTaskLinkPayload">${taskLinkPayload}</script><script src="/assets/shopping-task-link.js?v=${APP_VERSION}-task-date-1"></script>`}
  <script src="/assets/shopping-new.js?v=${APP_VERSION}"></script>`;
}

/** Canonical server-rendered shopping-new page independent from the legacy app.ts monolith. */
export async function shoppingNew(ctx:AppContext,date?:string,selectedTaskId=0):Promise<Response>{
  const m=ctx.member;
  if(!m){
    const url=new URL(ctx.request.url);
    const next=validateLiffNext(url.pathname+url.search);
    return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');
  }
  const d=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'';
  const [tasks,members]=await Promise.all([
    ctx.env.DB.prepare(`SELECT id,title,start_at,end_at,due_at,visibility_scope FROM tasks t WHERE family_id=? AND status<>'completed' AND (visibility_scope='FAMILY' OR (id=? AND ${taskVisibilitySql('t')})) ORDER BY coalesce(start_at,due_at),id LIMIT 200`).bind(m.family_id,selectedTaskId,m.id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>(),
  ]);
  const body=`<div class="page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>🛒 買い物を追加</h1></div><a class="btn gray" href="/app/shopping.php">戻る</a></div>${shoppingBatchForm(ctx,tasks.results,d,members.results,selectedTaskId)}`;
  return html(layout('買い物を追加',body,'/app/shopping.php'));
}
