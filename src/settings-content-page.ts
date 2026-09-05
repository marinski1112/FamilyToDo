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
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';

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
  const [tasks,items,shops,msgs,familyLogs,categoryCatalog,sharedDiagnostic]=await Promise.all([
    ctx.env.DB.prepare(`SELECT id,title,status,created_at,created_by FROM tasks t WHERE family_id=? AND ${taskVisibilitySql('t')} ORDER BY id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.id,i.name,i.status,i.created_at,i.created_by FROM items i WHERE i.family_id=? AND ${taskChildVisibilitySql('i')} ORDER BY i.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT s.id,s.name,s.status,s.created_at,s.created_by FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} ORDER BY s.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,text,created_at,sender_id FROM messages WHERE family_id=? ORDER BY id DESC LIMIT 30').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare("SELECT l.id,l.log_type,l.occurred_at,l.created_at,l.created_by,s.name subject_name FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id WHERE l.family_id=? AND l.deleted_at IS NULL ORDER BY l.occurred_at DESC,l.id DESC LIMIT 30").bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT name,enabled FROM shopping_category_catalog WHERE family_id=?').bind(m.family_id).all<Row>(),
    admin?sharedStampDiagnostic(ctx):Promise.resolve<SharedStampDiagnostic>({urlConfigured:false,tokenConfigured:false,configValid:false,dbProjectionReady:false,ready:false,code:'URL_MISSING'}),
  ]);
  const own=(id:unknown)=>admin||Number(id)===m.id;
  const section=(title:string,icon:string,rows:{results:Row[]},link:(r:Row)=>string,name:(r:Row)=>string)=>`<div class="card content-admin"><h2>${icon} ${title}</h2>${rows.results.map(r=>`<div class="content-row"><div><strong>${esc(name(r))}</strong><div class="meta">${esc(r.created_at||'')} / ${esc(r.status||'')}</div></div>${own(r.created_by??r.sender_id)?`<a class="btn gray small" href="${link(r)}">開く</a>`:''}</div>`).join('')||'<p class="empty">ありません。</p>'}</div>`;
  const categoryOptions=admin?resolveShoppingCategoryOptions(categoryCatalog.results):[];
  const categoryAdmin=admin?`<div class="card content-admin" id="shoppingCategoryAdmin"><h2>🗂️ 買い物カテゴリ</h2><p class="small">買い物入力のプルダウン候補を管理します。削除しても、過去・既存の買い物に保存済みのカテゴリ名は変更されません。</p><div id="shoppingCategoryList">${categoryOptions.map(name=>`<div class="content-row" data-shopping-category-row><strong>${esc(name)}</strong><button class="btn gray small" type="button" data-shopping-category-delete="${esc(name)}">削除</button></div>`).join('')||'<p class="empty">選択可能なカテゴリはありません。</p>'}</div><p class="small" id="shoppingCategoryAdminStatus" role="status" aria-live="polite"></p></div><script type="application/json" id="shoppingCategoryAdminPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c')}</script><script defer src="/assets/settings-shopping-categories.js"></script>`:'';
  const diagnosticMark=(ok:boolean)=>ok?'✅':'❌';
  const sharedDiagnosticAdmin=admin?`<div class="card content-admin" id="sharedStampDiagnostic"><h2>🔎 共有スタンプ接続診断</h2><p class="small">「みてにゃと共有」ボタンの表示条件を、秘密値を表示せずに確認します。</p><div class="content-row"><span>サービスURL</span><strong>${diagnosticMark(sharedDiagnostic.urlConfigured)} ${sharedDiagnostic.urlConfigured?'設定済み':'未設定'}</strong></div><div class="content-row"><span>サービストークン</span><strong>${diagnosticMark(sharedDiagnostic.tokenConfigured)} ${sharedDiagnostic.tokenConfigured?'設定済み':'未設定'}</strong></div><div class="content-row"><span>共有設定形式</span><strong>${diagnosticMark(sharedDiagnostic.configValid)} ${sharedDiagnostic.configValid?'正常':'要確認'}</strong></div><div class="content-row"><span>D1参照テーブル</span><strong>${diagnosticMark(sharedDiagnostic.dbProjectionReady)} ${sharedDiagnostic.dbProjectionReady?'利用可能':'参照失敗'}</strong></div><div class="content-row"><span>共有公開準備</span><strong>${diagnosticMark(sharedDiagnostic.ready)} ${sharedDiagnostic.ready?'利用可能':'利用不可'}</strong></div><p class="small">診断コード: <code>${sharedDiagnostic.code}</code></p><p class="small">共有サービス側のトークン一致は公開操作時に検証されます。この画面にはSecret値・認証情報・R2キーを表示しません。</p></div>`:'';
  const stampAdmin=admin?`<div class="card content-admin" id="calendarStampSequenceAdmin"><h2>🎞️ アニメーションスタンプ登録</h2><p class="small">連続PNGを2〜48枚選ぶと、選択順にFamilyToDoの管理メディアへアップロードし、1つのアニメーションスタンプとして登録します。共有設定が完了している場合は、そのままみてにゃでも利用できる共有スタンプとして公開します。</p><form id="calendarStampSequenceForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>スタンプ名</label><input name="name" maxlength="80" required placeholder="Happy Birthday"><label>PNGフレーム</label><input name="pngFrames" type="file" accept="image/png,.png" multiple><p class="small">ファイル選択画面の並び順が再生順になります。元画像は1枚32MiB・合計128MiBまで選択でき、ブラウザ内で長辺384px以下へ圧縮してからアップロードします。圧縮後も全フレーム合計が1MiBを超える場合は、アニメーションを保ったまま全フレームを同率でさらに自動縮小します。</p><label>1フレームの表示時間</label><input name="durationMs" type="number" min="40" max="2000" step="10" value="120" inputmode="numeric"><div class="form-grid"><label>幅（任意）<input name="width" type="number" min="1" max="4096" inputmode="numeric"></label><label>高さ（任意）<input name="height" type="number" min="1" max="4096" inputmode="numeric"></label></div><details><summary>既存ASSETSのPNGパスから登録</summary><p class="small">従来どおり、1行に <code>assets/stamps/example/001.png,120</code> の形式で2〜48フレームを入力できます。ファイルが選択されている場合はこちらは使用されません。ASSETS登録はFamilyToDo内のみで、共有公開の対象外です。</p><textarea name="frames" rows="6" placeholder="assets/stamps/birthday/001.png,120&#10;assets/stamps/birthday/002.png,120"></textarea><label>ASSETSサムネイル（任意）</label><input name="thumbnailStorageKey" placeholder="assets/stamps/birthday/thumb.png"></details><button type="submit">スタンプを登録</button><p class="small" id="calendarStampSequenceStatus" role="status" aria-live="polite"></p></form></div><div class="card content-admin" id="calendarStampInventoryAdmin"><h2>🗂️ 登録済みスタンプ</h2><p class="small">カレンダーと伝言で共通利用するスタンプです。共有条件を満たすUPLOADの連続PNGは、みてにゃと共有できます。無効化すると新規選択と表示対象から外れますが、履歴・配置・R2画像は削除しません。再度有効化できます。</p><div id="calendarStampInventory" aria-live="polite"><p class="small">読み込み中…</p></div><p class="small" id="calendarStampInventoryStatus" role="status" aria-live="polite"></p></div><script defer src="/assets/settings-stamps.js?v=${APP_VERSION}-${SETTINGS_STAMPS_UI_REVISION}"></script>`:'';
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>📋 投稿管理</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div>${categoryAdmin}${sharedDiagnosticAdmin}${stampAdmin}${section('タスク','📝',tasks,r=>`/task/view.php?id=${r.id}`,r=>String(r.title||''))}${section('持ち物','🎒',items,r=>`/item/edit.php?id=${r.id}`,r=>String(r.name||''))}${section('買い物','🛒',shops,r=>`/app/shopping_edit.php?id=${r.id}`,r=>String(r.name||''))}${section('伝言','💬',msgs,r=>`/app/messages.php`,r=>String(r.text||''))}${section('家族ログ','🐣',familyLogs,r=>`/app/family_log.php?date=${String(r.occurred_at||'').slice(0,10)}`,r=>`${FAMILY_LOG_TYPE_META[String(r.log_type||'MEMO')]?.label||String(r.log_type||'記録')}${r.subject_name?' / '+String(r.subject_name):''}`)}`;
  return html(layout('投稿管理',body,'/app/settings.php'));
}