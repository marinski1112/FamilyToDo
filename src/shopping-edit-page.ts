import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { archiveShoppingCompletionStatements } from './lifecycle';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { isValidShoppingCategoryName, normalizeShoppingCategoryName, resolveShoppingCategoryOptions, SHOPPING_CATEGORY_MAX_LENGTH, shoppingCategoryKey } from './shopping-categories';
import { goodsVisibilitySql } from './goods-visibility';
import { validateLiffNext } from './liff-target';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const bad=(message:string)=>json({ok:false,error:message,code:'BAD_REQUEST'},400);
const shoppingChecklistUrl=(value:unknown)=>{
  const date=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)?`/app/tasks.php?date=${encodeURIComponent(date)}#shopping-checklist`:'/app/tasks.php#shopping-checklist';
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

/** Canonical shopping-edit page retained independently from the legacy app.ts monolith. */
export async function shoppingEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);
  const item=await ctx.env.DB.prepare(`SELECT s.* FROM shopping_items s WHERE s.id=? AND s.family_id=? AND ${goodsVisibilitySql('s')}`).bind(id,m.family_id,m.id).first<Row>();
  if(!item)return new Response('買い物が見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase();
  if(!(role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id))return new Response('編集権限がありません。',{status:403});
  const history=await ctx.env.DB.prepare('SELECT h.*,m.name member_name FROM shopping_completion_history h LEFT JOIN members m ON m.id=h.member_id WHERE h.shopping_item_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30').bind(id).all<Row>();
  const catalog=await ctx.env.DB.prepare('SELECT name,enabled FROM shopping_category_catalog WHERE family_id=?').bind(m.family_id).all<Row>();

  if(request.method==='POST'){
    const parsed=await requireBody(request);
    if(parsed instanceof Response)return parsed;
    const b=parsed;
    const csrfFailure=csrfResponse(ctx,b.csrf);
    if(csrfFailure)return csrfFailure;
    const action=String(b.action||'save');
    if(action==='delete'){
      await ctx.env.DB.batch([
        ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,id,nowJst()),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(id,m.family_id),
      ]);
      return redirect(shoppingChecklistUrl(item.due_date));
    }
    const name=String(b.name||'').trim();
    if(!name)return bad('商品名を入力してください。');
    const category=normalizeShoppingCategoryName(b.category);
    if(category&&!isValidShoppingCategoryName(category))return bad(`カテゴリー名は1〜${SHOPPING_CATEGORY_MAX_LENGTH}文字で入力してください。`);
    const rawUrl=String(b.url||'').trim();
    if(rawUrl){try{const url=new URL(rawUrl);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{return bad('URLが不正です。');}}
    const quantity=String(b.quantity||'1').trim()||'1';
    const due=String(b.due_date||'').trim()||null;
    await ctx.env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,category=?,memo=?,due_date=?,url=?,updated_at=? WHERE id=? AND family_id=?').bind(name,quantity,category||null,String(b.memo||'')||null,due,rawUrl||null,nowJst(),id,m.family_id).run();
    return redirect(shoppingChecklistUrl(due||item.due_date));
  }

  const currentCategory=normalizeShoppingCategoryName(item.category);
  const categoryOptions=resolveShoppingCategoryOptions(catalog.results);
  const currentKey=shoppingCategoryKey(currentCategory);
  const currentCatalogIndex=categoryOptions.findIndex(option=>shoppingCategoryKey(option)===currentKey);
  const currentIsCatalogued=Boolean(currentCategory&&currentCatalogIndex>=0);
  const categoryOptionHtml=categoryOptions.map((option,index)=>{
    if(currentIsCatalogued&&index===currentCatalogIndex)return `<option value="${esc(currentCategory)}" selected>${esc(currentCategory)}</option>`;
    return `<option value="${esc(option)}">${esc(option)}</option>`;
  }).join('');
  const customSelected=Boolean(currentCategory&&!currentIsCatalogued);
  const body=`<div class="card"><h1>🛒 買い物編集</h1><form method="post" id="shoppingEditForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>商品名</label><input name="name" required value="${esc(item.name)}"><label>数量</label><input type="text" name="quantity" value="${esc(item.quantity||'1')}"><label for="shoppingEditCategorySelect">カテゴリー</label><select id="shoppingEditCategorySelect"><option value="" ${currentCategory?'':'selected'}>カテゴリーなし</option>${categoryOptionHtml}<option value="__custom__" ${customSelected?'selected':''}>自由入力</option></select><div id="shoppingEditCategoryCustomWrap" ${customSelected?'':'hidden'}><label for="shoppingEditCategoryCustom">自由入力</label><input type="text" id="shoppingEditCategoryCustom" maxlength="${SHOPPING_CATEGORY_MAX_LENGTH}" autocomplete="off" value="${customSelected?esc(currentCategory):''}" placeholder="カテゴリー名"><label class="checkrow"><input type="checkbox" id="shoppingEditCategoryRegister"><span>このカテゴリを登録</span></label></div><input type="hidden" name="category" id="shoppingEditCategoryValue" value="${esc(currentCategory)}"><p class="small">登録済みカテゴリーから選択できます。候補にない場合は「自由入力」を選び、必要なら家族の候補として登録できます。</p><label>URL</label><input type="url" name="url" value="${esc(item.url||'')}"><label>メモ</label><textarea name="memo">${esc(item.memo||'')}</textarea><label>期限日</label><input type="date" name="due_date" id="shoppingTaskDueDate" value="${esc(item.due_date||'')}"><button name="action" value="save">保存する</button></form><div class="card"><h2>完了履歴</h2>${history.results.map(row=>`<div class="row">${esc(row.action)} ・ ${esc(row.member_name||'')} ・ ${esc(row.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div><form method="post" onsubmit="return confirm('この買い物を削除しますか？')"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="btn danger" name="action" value="delete">削除</button></form><script src="/assets/shopping-edit.js?v=${APP_VERSION}-category-picker-1"></script></div>`;
  return html(layout('買い物編集',body,''));
}
