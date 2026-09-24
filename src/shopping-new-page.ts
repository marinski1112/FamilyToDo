import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html, redirect } from './response';
import { resolveShoppingCategoryOptions, SHOPPING_CATEGORY_MAX_LENGTH } from './shopping-categories';
import { validateLiffNext } from './liff-target';
import { APP_VERSION } from './version';

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const shoppingChecklistUrl=(date='')=>date?`/app/tasks.php?date=${encodeURIComponent(date)}#shopping-checklist`:'/app/tasks.php#shopping-checklist';

function shoppingBatchForm(ctx:AppContext,date='',categoryOptions:string[]=[]):string{
  const csrf=ctx.session.csrfToken??'';
  const defaultDate=esc(date);
  const categoryOptionHtml=categoryOptions.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
  return `<div class="card form-card batch-shopping-card" id="addShopping">
    <div class="section-head"><h2>＋ 買い物を追加</h2><span class="meta">複数商品を一度に登録できます</span></div>
    <form id="shopBatchForm" class="compact-form">
      <input type="hidden" name="csrf" value="${esc(csrf)}">
      <div id="shoppingProducts">
        <div class="product-row batch-product" data-product-row><input type="text" name="product_name[]" maxlength="255" placeholder="商品名" required><input type="text" name="product_quantity[]" value="1" maxlength="128" inputmode="text" placeholder="数量" aria-label="数量"><button type="button" class="product-url-toggle" aria-expanded="false" aria-label="商品URLを入力" title="商品URL">🔗</button><span class="product-row-spacer" aria-hidden="true"></span><div class="product-url-popover" hidden><div class="product-url-popover-head"><strong>商品URL</strong><button type="button" class="product-url-close" aria-label="URL入力を閉じる">×</button></div><input type="url" name="product_url[]" maxlength="2048" placeholder="https://..." aria-label="商品URL"><p class="small">商品ページのURLがある場合だけ入力してください。</p></div></div>
      </div>
      <button type="button" class="btn gray small add-product" id="addProduct">＋ 商品を追加</button>
      <div class="batch-common-settings">
        <label for="shoppingCategorySelect">カテゴリー（全商品共通）</label>
        <select id="shoppingCategorySelect" aria-describedby="shoppingCategoryHint"><option value="">カテゴリーなし</option>${categoryOptionHtml}<option value="__custom__">自由入力</option></select>
        <div id="shoppingCategoryCustomWrap" hidden><label for="shoppingCategoryCustom">自由入力</label><input type="text" id="shoppingCategoryCustom" maxlength="${SHOPPING_CATEGORY_MAX_LENGTH}" autocomplete="off" placeholder="カテゴリー名"><label class="checkrow"><input type="checkbox" id="shoppingCategoryRegister"><span>このカテゴリを登録</span></label></div>
        <input type="hidden" name="category" id="shoppingCategoryValue" value="">
        <p class="small" id="shoppingCategoryHint">登録済みカテゴリーから選択できます。候補にない場合は「自由入力」を選び、必要なら家族の候補として登録できます。</p>
        <label>期限（全商品共通）</label>
        <input type="date" name="due_date" id="shoppingTaskDueDate" value="${defaultDate}">
        <label>メモ（全商品共通・任意）</label>
        <textarea name="memo" placeholder="例：低脂肪、○○店で購入"></textarea>
      </div>
      <button type="submit">まとめて登録する</button>
    </form>
  </div>
  <script type="application/json" id="shoppingNewPayload">${JSON.stringify({csrf}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script>
  <script src="/assets/shopping-new.js?v=${APP_VERSION}-category-register-1"></script>`;
}

/** Canonical server-rendered shopping-new page independent from the legacy app.ts monolith. */
export async function shoppingNew(ctx:AppContext,date?:string):Promise<Response>{
  const m=ctx.member;
  if(!m){
    const url=new URL(ctx.request.url);
    const next=validateLiffNext(url.pathname+url.search);
    return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');
  }
  const d=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'';
  const catalog=await ctx.env.DB.prepare('SELECT name,enabled FROM shopping_category_catalog WHERE family_id=? ORDER BY name COLLATE NOCASE,id').bind(m.family_id).all<Row>();
  const categoryOptions=resolveShoppingCategoryOptions(catalog.results);
  const checklistUrl=shoppingChecklistUrl(d);
  const body=`<div class="page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>🛒 買い物を追加</h1></div><a class="btn gray" href="${checklistUrl}">戻る</a></div>${shoppingBatchForm(ctx,d,categoryOptions)}`;
  return html(layout('買い物を追加',body,'/app/tasks.php'));
}
