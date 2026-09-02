import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { archiveShoppingCompletionStatements } from './lifecycle';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { taskVisibilitySql } from './task-visibility';
import { validateLiffNext } from './liff-target';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const bad=(message:string)=>json({ok:false,error:message,code:'BAD_REQUEST'},400);

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
  if(typeof token!=='string'||token!==ctx.session.csrfToken)return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);
  return null;
}

/** Canonical shopping-edit page retained independently from the legacy app.ts monolith. */
export async function shoppingEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);
  const item=await ctx.env.DB.prepare(`SELECT s.* FROM shopping_items s WHERE s.id=? AND s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${taskVisibilitySql('t')}))`).bind(id,m.family_id,m.id).first<Row>();
  if(!item)return new Response('買い物が見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase();
  if(!(role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id))return new Response('編集権限がありません。',{status:403});
  const privateParent=Number(item.task_id||0)?await ctx.env.DB.prepare("SELECT id,title,private_owner_id FROM tasks WHERE id=? AND family_id=? AND visibility_scope='PRIVATE' AND private_owner_id=?").bind(Number(item.task_id),m.family_id,m.id).first<Row>():null;
  const tasks=await ctx.env.DB.prepare("SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND status<>'completed' ORDER BY coalesce(start_at,due_at),id").bind(m.family_id).all<Row>();
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const assigned=await ctx.env.DB.prepare('SELECT member_id FROM shopping_assignees WHERE shopping_item_id=?').bind(id).all<Row>();
  const history=await ctx.env.DB.prepare('SELECT h.*,m.name member_name FROM shopping_completion_history h LEFT JOIN members m ON m.id=h.member_id WHERE h.shopping_item_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30').bind(id).all<Row>();
  const assignedSet=new Set(assigned.results.map(row=>Number(row.member_id)));

  if(request.method==='POST'){
    const parsed=await requireBody(request);
    if(parsed instanceof Response)return parsed;
    const b=parsed;
    const csrfFailure=csrfResponse(ctx,b.csrf);
    if(csrfFailure)return csrfFailure;
    const action=String(b.action||'save');
    if(action==='delete'){
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(id),
        ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,id,nowJst()),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(id,m.family_id),
      ]);
      return redirect('/app/shopping.php');
    }
    const name=String(b.name||'').trim();
    if(!name)return bad('商品名を入力してください。');
    const rawUrl=String(b.url||'').trim();
    if(rawUrl){try{const url=new URL(rawUrl);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{return bad('URLが不正です。');}}
    const quantity=String(b.quantity||'1').trim()||'1';
    const taskId=privateParent?Number(item.task_id):(Number(b.task_id||0)||null);
    let due=String(b.due_date||'').trim()||null;
    if(taskId){
      const task=await ctx.env.DB.prepare(`SELECT t.start_at,t.due_at FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first<Row>();
      if(!task)return bad('タスクが見つかりません。');
      due=String(task.start_at||task.due_at||'').slice(0,10)||null;
    }
    await ctx.env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,category=?,memo=?,due_date=?,task_id=?,url=?,updated_at=? WHERE id=? AND family_id=?').bind(name,quantity,String(b.category||'')||null,String(b.memo||'')||null,due,taskId,rawUrl||null,nowJst(),id,m.family_id).run();
    const assignees=privateParent?[Number(privateParent.private_owner_id)]:(Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[]);
    await ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(id).run();
    if(assignees.length)await ctx.env.DB.batch(assignees.map(memberId=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,memberId,m.family_id)));
    await ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN (SELECT member_id FROM shopping_assignees WHERE shopping_item_id=?)').bind(id,id).run();
    await ctx.env.DB.prepare("UPDATE shopping_items SET status=CASE WHEN (SELECT COUNT(*) FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=shopping_items.id)=0 THEN 'pending' WHEN (SELECT COUNT(*) FROM shopping_completions sc JOIN shopping_assignees sa ON sa.shopping_item_id=sc.shopping_item_id AND sa.member_id=sc.member_id JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sc.shopping_item_id=shopping_items.id)>0 THEN 'completed' ELSE 'pending' END,updated_at=? WHERE id=? AND family_id=?").bind(nowJst(),id,m.family_id).run();
    return redirect('/app/shopping.php');
  }

  const body=`<div class="card"><h1>🛒 買い物編集</h1><form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>商品名</label><input name="name" required value="${esc(item.name)}"><label>数量</label><input type="text" name="quantity" value="${esc(item.quantity||'1')}"><label>カテゴリー</label><input name="category" value="${esc(item.category||'')}"><label>URL</label><input type="url" name="url" value="${esc(item.url||'')}"><label>メモ</label><textarea name="memo">${esc(item.memo||'')}</textarea><label>担当者</label>${privateParent?'<p class="notice">🔒 自分専用タスクのため、担当者はあなたのみです</p>':members.results.map(row=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${row.id}" ${assignedSet.has(Number(row.id))?'checked':''}> ${esc(row.name)}</label>`).join('')}<label>紐づくタスク</label><select name="task_id" ${privateParent?'disabled':''}>${privateParent?`<option value="${privateParent.id}" selected>🔒 ${esc(privateParent.title)}</option>`:`<option value="0">タスクなし</option>${tasks.results.map(task=>`<option value="${task.id}" ${Number(item.task_id)===Number(task.id)?'selected':''}>${esc(task.title)}</option>`).join('')}`}</select>${privateParent?`<input type="hidden" name="task_id" value="${privateParent.id}"><p class="small">自分専用タスクとの紐付けは編集時に解除できません。</p>`:''}<label>期限日</label><input type="date" name="due_date" value="${esc(item.due_date||'')}"><button name="action" value="save">保存する</button></form><div class="card"><h2>完了履歴</h2>${history.results.map(row=>`<div class="row">${esc(row.action)} ・ ${esc(row.member_name||'')} ・ ${esc(row.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div><form method="post" onsubmit="return confirm('この買い物を削除しますか？')"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="btn danger" name="action" value="delete">削除</button></form></div>`;
  return html(layout('買い物編集',body,''));
}
