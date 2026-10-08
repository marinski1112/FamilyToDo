import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { APP_VERSION } from './version';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import {
  createFamilySharedStampRegistryClient,
  familySharedStampRegistryConfigFromEnv,
} from './calendar-shared-stamp-registry';
import { html, redirect } from './response';
import { resolveShoppingCategoryOptions } from './shopping-categories';
import { CONTENT_KINDS,contentListing } from './content-listing';

type Row = Record<string, unknown>;

type SharedStampDiagnostic={
  urlConfigured:boolean;
  tokenConfigured:boolean;
  configValid:boolean;
  dbProjectionReady:boolean;
  ready:boolean;
  code:'READY'|'URL_MISSING'|'TOKEN_MISSING'|'CONFIG_INVALID'|'DB_PROJECTION_FAILED';
};

const SETTINGS_STAMPS_UI_REVISION='shared-publish-3';

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

async function sharedStampDiagnostic(ctx:AppContext):Promise<SharedStampDiagnostic>{
  const urlConfigured=Boolean(String(ctx.env.SHARED_STAMPS_SERVICE_URL||'').trim());
  const tokenConfigured=Boolean(String(ctx.env.SHARED_STAMPS_SERVICE_TOKEN||'').trim());
  let configValid=false;
  if(urlConfigured&&tokenConfigured){
    try{
      const config=familySharedStampRegistryConfigFromEnv(ctx.env);
      if(config){createFamilySharedStampRegistryClient(config);configValid=true;}
    }catch{configValid=false;}
  }
  let dbProjectionReady=false;
  try{
    await ctx.env.DB.prepare('SELECT 1 FROM calendar_shared_stamp_refs LIMIT 1').first();
    dbProjectionReady=true;
  }catch{dbProjectionReady=false;}
  const ready=configValid&&dbProjectionReady;
  const code:SharedStampDiagnostic['code']=ready?'READY':!urlConfigured?'URL_MISSING':!tokenConfigured?'TOKEN_MISSING':!configValid?'CONFIG_INVALID':'DB_PROJECTION_FAILED';
  return {urlConfigured,tokenConfigured,configValid,dbProjectionReady,ready,code};
}

/** Content administration page retained outside the legacy app.ts monolith. */
export async function settingsContent(ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return redirect('/login.php?next=%2Fapp%2Fsettings_content.php');
  const role=String(m.role||'').toUpperCase(),admin=role==='OWNER'||role==='ADMIN';
  const url=new URL(ctx.request.url),appearance=admin&&url.searchParams.get('view')==='appearance';
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  const listing=contentListing(url,Number(m.family_id),Number(m.id),now);
  const [rows,categoryCatalog,sharedDiagnostic]=await Promise.all([
    appearance?Promise.resolve({results:[] as Row[]}):ctx.env.DB.prepare(listing.sql).bind(...listing.values).all<Row>(),
    appearance?ctx.env.DB.prepare('SELECT name,enabled FROM shopping_category_catalog WHERE family_id=?').bind(m.family_id).all<Row>():Promise.resolve({results:[] as Row[]}),
    appearance?sharedStampDiagnostic(ctx):Promise.resolve<SharedStampDiagnostic>({urlConfigured:false,tokenConfigured:false,configValid:false,dbProjectionReady:false,ready:false,code:'URL_MISSING'}),
  ]);
  const own=(id:unknown)=>admin||Number(id)===m.id;
  const name=(r:Row)=>listing.kind==='tasks'?String(r.title||''):listing.kind==='messages'?String(r.text||''):listing.kind==='logs'?`${FAMILY_LOG_TYPE_META[String(r.log_type||'MEMO')]?.label||String(r.log_type||'記録')}${r.subject_name?' / '+String(r.subject_name):''}`:String(r.name||'');
  const link=(r:Row)=>listing.kind==='tasks'?`/task/view.php?id=${r.id}`:listing.kind==='items'?`/item/edit.php?id=${r.id}`:listing.kind==='shopping'?`/app/shopping_edit.php?id=${r.id}`:listing.kind==='messages'?`/app/messages.php?focus=${r.id}`:`/app/family_log.php?date=${new Intl.DateTimeFormat('sv-SE',{timeZone:String(m.family_timezone||'Asia/Tokyo'),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(String(r.occurred_at)))}`;
  const listHref=(before=0)=>{const params=new URLSearchParams({kind:listing.kind});if(listing.q)params.set('q',listing.q);if(before)params.set('before',String(before));return '/app/settings_content.php?'+params;};
  const visible=rows.results.slice(0,30),hasMore=rows.results.length>30;
  const content=`<form method="get" class="card"><label>種類<select name="kind">${Object.entries(CONTENT_KINDS).map(([key,label])=>`<option value="${key}"${key===listing.kind?' selected':''}>${label}</option>`).join('')}</select></label><label>検索<input name="q" maxlength="100" value="${esc(listing.q)}" placeholder="名前・本文を検索"></label><div class="actions"><button>表示する</button>${listing.q||listing.before?`<a class="btn gray" href="/app/settings_content.php?kind=${listing.kind}">条件を解除</a>`:''}</div></form><section class="card content-admin"><h2>${CONTENT_KINDS[listing.kind]}</h2><p class="small">登録順に最近の30件ずつ表示します。${listing.kind==='logs'?'記録対象・メモでも検索できます。':''}</p>${visible.map(r=>`<div class="content-row"><div><strong>${esc(name(r))}</strong><div class="meta">${esc(r.created_at||'')} / ${esc(r.status||'')}</div></div>${own(r.created_by??r.sender_id)?`<a class="btn gray small" href="${esc(link(r))}">開く</a>`:''}</div>`).join('')||'<p class="empty">該当する投稿はありません。</p>'}<div class="actions">${listing.before?`<a class="btn gray" href="${esc(listHref())}">最新の一覧へ</a>`:''}${hasMore?`<a class="btn gray" href="${esc(listHref(Number(visible.at(-1)?.id)))}">さらに以前の30件</a>`:''}</div></section>`;
  const categoryOptions=appearance?resolveShoppingCategoryOptions(categoryCatalog.results):[];
  const categoryAdmin=appearance?`<div class="card content-admin" id="shoppingCategoryAdmin"><h2>🗂️ 買い物カテゴリ</h2><p class="small">買い物入力のプルダウン候補を管理します。削除しても、過去・既存の買い物に保存済みのカテゴリ名は変更されません。</p><div id="shoppingCategoryList">${categoryOptions.map(name=>`<div class="content-row" data-shopping-category-row><strong>${esc(name)}</strong><button class="btn gray small" type="button" data-shopping-category-delete="${esc(name)}">削除</button></div>`).join('')||'<p class="empty">選択可能なカテゴリはありません。</p>'}</div><p class="small" id="shoppingCategoryAdminStatus" role="status" aria-live="polite"></p></div><script type="application/json" id="shoppingCategoryAdminPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c')}</script><script defer src="/assets/settings-shopping-categories.js"></script>`:'';
  const diagnosticMark=(ok:boolean)=>ok?'✅':'❌';
  const sharedDiagnosticAdmin=appearance?`<div class="card content-admin" id="sharedStampDiagnostic"><h2>🔎 共有スタンプ接続診断</h2><p class="small">「みてにゃと共有」ボタンの表示条件を、秘密値を表示せずに確認します。</p><div class="content-row"><span>サービスURL</span><strong>${diagnosticMark(sharedDiagnostic.urlConfigured)} ${sharedDiagnostic.urlConfigured?'設定済み':'未設定'}</strong></div><div class="content-row"><span>サービストークン</span><strong>${diagnosticMark(sharedDiagnostic.tokenConfigured)} ${sharedDiagnostic.tokenConfigured?'設定済み':'未設定'}</strong></div><div class="content-row"><span>共有設定形式</span><strong>${diagnosticMark(sharedDiagnostic.configValid)} ${sharedDiagnostic.configValid?'正常':'要確認'}</strong></div><div class="content-row"><span>D1参照テーブル</span><strong>${diagnosticMark(sharedDiagnostic.dbProjectionReady)} ${sharedDiagnostic.dbProjectionReady?'利用可能':'参照失敗'}</strong></div><div class="content-row"><span>共有公開準備</span><strong>${diagnosticMark(sharedDiagnostic.ready)} ${sharedDiagnostic.ready?'利用可能':'利用不可'}</strong></div><p class="small">診断コード: <code>${sharedDiagnostic.code}</code></p><p class="small">共有サービス側のトークン一致は公開操作時に検証されます。この画面にはSecret値・認証情報・R2キーを表示しません。</p></div>`:'';
  const stampAdmin=appearance?`<div class="card content-admin" id="calendarStampSequenceAdmin"><h2>🎞️ アニメーションスタンプ登録</h2><p class="small">連続PNGを2〜48枚選ぶと、選択順にFamilyToDoの管理メディアへアップロードし、1つのアニメーションスタンプとして登録します。共有設定が完了している場合は、そのままみてにゃでも利用できる共有スタンプとして公開します。</p><form id="calendarStampSequenceForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label for="settings-content-page-field-1">スタンプ名</label><input id="settings-content-page-field-1" name="name" maxlength="80" required placeholder="Happy Birthday"><label for="settings-content-page-field-2">PNGフレーム</label><input id="settings-content-page-field-2" name="pngFrames" type="file" accept="image/png,.png" multiple><p class="small">ファイル選択画面の並び順が再生順になります。元画像は1枚32MiB・合計128MiBまで選択でき、ブラウザ内で長辺384px以下へ圧縮してからアップロードします。圧縮後も全フレーム合計が1MiBを超える場合は、アニメーションを保ったまま全フレームを同率でさらに自動縮小します。</p><label for="settings-content-page-field-3">1フレームの表示時間</label><input id="settings-content-page-field-3" name="durationMs" type="number" min="40" max="2000" step="10" value="120" inputmode="numeric"><div class="form-grid"><label>幅（任意）<input name="width" type="number" min="1" max="4096" inputmode="numeric"></label><label>高さ（任意）<input name="height" type="number" min="1" max="4096" inputmode="numeric"></label></div><details><summary>既存ASSETSのPNGパスから登録</summary><p class="small">従来どおり、1行に <code>assets/stamps/example/001.png,120</code> の形式で2〜48フレームを入力できます。ファイルが選択されている場合はこちらは使用されません。ASSETS登録はFamilyToDo内のみで、共有公開の対象外です。</p><textarea aria-label="ASSETSのPNGフレーム一覧" name="frames" rows="6" placeholder="assets/stamps/birthday/001.png,120&#10;assets/stamps/birthday/002.png,120"></textarea><label for="settings-content-page-field-4">ASSETSサムネイル（任意）</label><input id="settings-content-page-field-4" name="thumbnailStorageKey" placeholder="assets/stamps/birthday/thumb.png"></details><button type="submit">スタンプを登録</button><p class="small" id="calendarStampSequenceStatus" role="status" aria-live="polite"></p></form></div><div class="card content-admin" id="calendarStampInventoryAdmin"><h2>🗂️ 登録済みスタンプ</h2><p class="small">カレンダーと伝言で共通利用するスタンプです。共有条件を満たすUPLOADの連続PNGは、みてにゃと共有できます。無効化すると新規選択と表示対象から外れますが、履歴・配置・R2画像は削除しません。再度有効化できます。</p><div id="calendarStampInventory" aria-live="polite"><p class="small">読み込み中…</p></div><p class="small" id="calendarStampInventoryStatus" role="status" aria-live="polite"></p></div><script defer src="/assets/settings-stamps.js?v=${APP_VERSION}-${SETTINGS_STAMPS_UI_REVISION}"></script>`:'';
  const stickerAdmin=appearance?`<div class="card content-admin" id="calendarStickerAdmin"><h2>🖼️ カレンダーステッカー</h2><p class="small">日付の背景を飾る静止PNGを登録します。家族内のカレンダーで日付を長押しして選べます。文字が読めるよう背景は淡く表示されます。</p><form id="calendarStickerForm"><label>名前<input name="name" required maxlength="80" placeholder="お祝い"></label><label>PNG画像<input name="image" type="file" accept="image/png,.png" required></label><button type="submit">ステッカーを登録</button></form><p class="small" id="calendarStickerStatus" role="status" aria-live="polite"></p><div id="calendarStickerInventory"></div></div><script type="application/json" id="calendarStickerAdminPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c')}</script><script defer src="/assets/settings-stickers.js?v=${APP_VERSION}"></script>`:'';
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>${appearance?'🎨 スタンプ・表示設定':'📋 投稿管理'}</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div><nav class="actions" aria-label="投稿管理メニュー"><a class="btn gray" href="/app/settings_content.php">投稿を探す</a>${admin?'<a class="btn gray" href="/app/settings_content.php?view=appearance">スタンプ・表示設定</a>':''}</nav>${appearance?categoryAdmin+stampAdmin+stickerAdmin+'<details class="card"><summary>共有スタンプ接続診断</summary>'+sharedDiagnosticAdmin+'</details>':content}`;
  return html(layout('投稿管理',body,'/app/settings.php'));
}
