import { redirect } from './response';
import { layout } from './app-shell';
import { APP_VERSION } from './version';

export async function itemNew(ctx:any,date:string):Promise<Response>{
  if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/item/new.php?date='+date));
  const esc=(value:unknown)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const body=`<div class="card form-card"><h1>🎒 持ち物追加</h1><div id="itemFormError" class="error" style="display:none"></div><form id="itemForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken)}"><label for="new-entry-pages-field-1">持ち物名</label><input id="new-entry-pages-field-1" name="name" maxlength="255" required autofocus><label for="new-entry-pages-field-2">日付</label><input id="new-entry-pages-field-2" type="date" name="date" value="${esc(date)}"><label for="new-entry-pages-field-3">メモ</label><textarea id="new-entry-pages-field-3" name="memo" maxlength="5000"></textarea><button type="submit">登録する</button></form></div><script src="/assets/item-new.js?v=${APP_VERSION}-goods-independent-1"></script>`;
  return new Response(layout('持ち物追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}});
}
