import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { archiveItemCompletionStatements } from './lifecycle';
import { validateLiffNext } from './liff-target';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { goodsVisibilitySql } from './goods-visibility';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'')
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
const normalizeCategory=(value:unknown)=>{
  const raw=String(value??'').trim();
  return !raw||raw==='未分類'?'':raw;
};
const validUrl=(raw:string)=>{
  if(!raw)return true;
  if(raw.length>2048)return false;
  try{const value=new URL(raw);return (value.protocol==='http:'||value.protocol==='https:')&&!value.username&&!value.password;}catch{return false;}
};

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

/** Canonical item-edit page retained independently from the legacy app.ts monolith. */
export async function itemEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);
  const item=await ctx.env.DB.prepare(`SELECT i.* FROM items i WHERE i.id=? AND i.family_id=? AND ${goodsVisibilitySql('i')}`).bind(id,m.family_id,m.id).first<Row>();
  if(!item)return new Response('持ち物が見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase();
  if(!(role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id))return new Response('編集権限がありません。',{status:403});
  const history=await ctx.env.DB.prepare('SELECT h.*,m.name member_name FROM item_completion_history h LEFT JOIN members m ON m.id=h.member_id WHERE h.item_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30').bind(id).all<Row>();
  const categories=await ctx.env.DB.prepare('SELECT name FROM item_category_catalog WHERE family_id=? AND enabled=1 ORDER BY name COLLATE NOCASE').bind(m.family_id).all<Row>();

  if(request.method==='POST'){
    const parsed=await requireBody(request);
    if(parsed instanceof Response)return parsed;
    const b=parsed;
    const csrfFailure=csrfResponse(ctx,b.csrf);
    if(csrfFailure)return csrfFailure;
    const action=String(b.action||'save');
    if(action==='delete'){
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(id),
        ...archiveItemCompletionStatements(ctx.env.DB,m.family_id,id,nowJst()),
        ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(id,m.family_id),
      ]);
      return redirect('/app/tasks.php');
    }
    const name=String(b.name||'').trim();
    if(!name)return bad('持ち物名を入力してください。');
    if(name.length>200)return bad('持ち物名は200文字以内で入力してください。');
    const memo=String(b.memo||'').trim();
    if(memo.length>2000)return bad('メモは2000文字以内で入力してください。');
    const category=normalizeCategory(b.category);
    if(category.length>255)return bad('カテゴリ名は255文字以内で入力してください。');
    const itemUrl=String(b.url||'').trim();
    if(!validUrl(itemUrl))return bad('URLは http:// または https:// で入力してください。');
    const due=String(b.due_date||'').trim()||null;
    if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return bad('日付が不正です。');
    await ctx.env.DB.prepare('UPDATE items SET name=?,memo=?,url=?,category=?,due_at=?,task_id=NULL,updated_at=? WHERE id=? AND family_id=?').bind(name,memo||null,itemUrl||null,category||null,due,nowJst(),id,m.family_id).run();
    if(category){
      await ctx.env.DB.batch([
        ctx.env.DB.prepare(`INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
          VALUES(?,?,1,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(m.family_id,category,m.id),
        ctx.env.DB.prepare('UPDATE item_category_catalog SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE family_id=? AND name=? COLLATE NOCASE').bind(m.family_id,category),
      ]);
    }
    return redirect(`/app/tasks.php${due?'?date='+encodeURIComponent(due):''}`);
  }

  const dueDate=String(item.due_at||'').slice(0,10);
  const category=normalizeCategory(item.category);
  const categoryOptions=categories.results.map(row=>String(row.name||'').trim()).filter(Boolean);
  const renderedBody=`<div class="card"><h1>🎒 持ち物編集</h1><form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input type="hidden" name="id" value="${id}"><label>持ち物</label><input name="name" required maxlength="200" value="${esc(item.name)}"><label>カテゴリ</label><input name="category" list="itemCategoryOptions" maxlength="255" value="${esc(category)}" placeholder="未分類"><datalist id="itemCategoryOptions">${categoryOptions.map(name=>`<option value="${esc(name)}"></option>`).join('')}</datalist><label>メモ</label><textarea name="memo" maxlength="2000">${esc(item.memo||'')}</textarea><label>URL</label><input type="url" name="url" maxlength="2048" inputmode="url" value="${esc(item.url||'')}" placeholder="https://..."><label>日付</label><input type="date" name="due_date" value="${esc(dueDate)}"><button name="action" value="save">保存する</button></form><div class="card"><h2>完了履歴</h2>${history.results.map(row=>`<div class="row">${esc(row.action)} ・ ${esc(row.member_name||'')} ・ ${esc(row.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div><form method="post" onsubmit="return confirm('この持ち物を削除しますか？')"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="btn danger" name="action" value="delete">削除</button></form></div>`;
  return html(layout('持ち物編集',renderedBody,''));
}
