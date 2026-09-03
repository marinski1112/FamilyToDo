import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { html, redirect } from './response';
import { resolveShoppingCategoryOptions } from './shopping-categories';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

/** Content administration page retained outside the legacy app.ts monolith. */
export async function settingsContent(ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return redirect('/login.php?next=%2Fapp%2Fsettings_content.php');
  const role=String(m.role||'').toUpperCase(),admin=role==='OWNER'||role==='ADMIN';
  const [tasks,items,shops,msgs,familyLogs,categoryCatalog]=await Promise.all([
    ctx.env.DB.prepare(`SELECT id,title,status,created_at,created_by FROM tasks t WHERE family_id=? AND ${taskVisibilitySql('t')} ORDER BY id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.id,i.name,i.status,i.created_at,i.created_by FROM items i WHERE i.family_id=? AND ${taskChildVisibilitySql('i')} ORDER BY i.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT s.id,s.name,s.status,s.created_at,s.created_by FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} ORDER BY s.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,text,created_at,sender_id FROM messages WHERE family_id=? ORDER BY id DESC LIMIT 30').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare("SELECT l.id,l.log_type,l.occurred_at,l.created_at,l.created_by,s.name subject_name FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id WHERE l.family_id=? AND l.deleted_at IS NULL ORDER BY l.occurred_at DESC,l.id DESC LIMIT 30").bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT name,enabled FROM shopping_category_catalog WHERE family_id=?').bind(m.family_id).all<Row>(),
  ]);
  const own=(id:unknown)=>admin||Number(id)===m.id;
  const section=(title:string,icon:string,rows:{results:Row[]},link:(r:Row)=>string,name:(r:Row)=>string)=>`<div class="card content-admin"><h2>${icon} ${title}</h2>${rows.results.map(r=>`<div class="content-row"><div><strong>${esc(name(r))}</strong><div class="meta">${esc(r.created_at||'')} / ${esc(r.status||'')}</div></div>${own(r.created_by??r.sender_id)?`<a class="btn gray small" href="${link(r)}">開く</a>`:''}</div>`).join('')||'<p class="empty">ありません。</p>'}</div>`;
  const categoryOptions=admin?resolveShoppingCategoryOptions(categoryCatalog.results):[];
  const categoryAdmin=admin?`<div class="card content-admin" id="shoppingCategoryAdmin"><h2>🗂️ 買い物カテゴリ</h2><p class="small">買い物入力のプルダウン候補を管理します。削除しても、過去・既存の買い物に保存済みのカテゴリ名は変更されません。</p><div id="shoppingCategoryList">${categoryOptions.map(name=>`<div class="content-row" data-shopping-category-row><strong>${esc(name)}</strong><button class="btn gray small" type="button" data-shopping-category-delete="${esc(name)}">削除</button></div>`).join('')||'<p class="empty">選択可能なカテゴリはありません。</p>'}</div><p class="small" id="shoppingCategoryAdminStatus" role="status" aria-live="polite"></p></div><script type="application/json" id="shoppingCategoryAdminPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c')}</script><script defer src="/assets/settings-shopping-categories.js"></script>`:'';
  const stampAdmin=admin?`<div class="card content-admin" id="calendarStampSequenceAdmin"><h2>🎞️ アニメーションスタンプ登録</h2><p class="small">連続PNGを2〜48枚選ぶと、選択順にFamilyToDoの管理メディアへアップロードし、1つのアニメーションスタンプとして登録します。透過PNGもそのまま保持されます。</p><form id="calendarStampSequenceForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>スタンプ名</label><input name="name" maxlength="80" required placeholder="Happy Birthday"><label>PNGフレーム</label><input name="pngFrames" type="file" accept="image/png,.png" multiple><p class="small">ファイル選択画面の並び順が再生順になります。1枚4MiBまで、2〜48枚。</p><label>1フレームの表示時間</label><input name="durationMs" type="number" min="40" max="2000" step="10" value="120" inputmode="numeric"><div class="form-grid"><label>幅（任意）<input name="width" type="number" min="1" max="4096" inputmode="numeric"></label><label>高さ（任意）<input name="height" type="number" min="1" max="4096" inputmode="numeric"></label></div><details><summary>既存ASSETSのPNGパスから登録</summary><p class="small">従来どおり、1行に <code>assets/stamps/example/001.png,120</code> の形式で2〜48フレームを入力できます。ファイルが選択されている場合はこちらは使用されません。</p><textarea name="frames" rows="6" placeholder="assets/stamps/birthday/001.png,120&#10;assets/stamps/birthday/002.png,120"></textarea><label>ASSETSサムネイル（任意）</label><input name="thumbnailStorageKey" placeholder="assets/stamps/birthday/thumb.png"></details><button type="submit">スタンプを登録</button><p class="small" id="calendarStampSequenceStatus" role="status" aria-live="polite"></p></form></div><div class="card content-admin" id="calendarStampInventoryAdmin"><h2>🗂️ 登録済みスタンプ</h2><p class="small">カレンダーと伝言で共通利用するスタンプです。無効化すると新規選択と表示対象から外れますが、履歴・配置・R2画像は削除しません。再度有効化できます。</p><div id="calendarStampInventory" aria-live="polite"><p class="small">読み込み中…</p></div><p class="small" id="calendarStampInventoryStatus" role="status" aria-live="polite"></p></div><script defer src="/assets/settings-stamps.js"></script>`:'';
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>📋 投稿管理</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div>${categoryAdmin}${stampAdmin}${section('タスク','📝',tasks,r=>`/task/view.php?id=${r.id}`,r=>String(r.title||''))}${section('持ち物','🎒',items,r=>`/item/edit.php?id=${r.id}`,r=>String(r.name||''))}${section('買い物','🛒',shops,r=>`/app/shopping_edit.php?id=${r.id}`,r=>String(r.name||''))}${section('伝言','💬',msgs,r=>`/app/messages.php`,r=>String(r.text||''))}${section('家族ログ','🐣',familyLogs,r=>`/app/family_log.php?date=${String(r.occurred_at||'').slice(0,10)}`,r=>`${FAMILY_LOG_TYPE_META[String(r.log_type||'MEMO')]?.label||String(r.log_type||'記録')}${r.subject_name?' / '+String(r.subject_name):''}`)}`;
  return html(layout('投稿管理',body,'/app/settings.php'));
}
