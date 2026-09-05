import fs from 'node:fs';

const page=fs.readFileSync('src/settings-content-page.ts','utf8');
const meta=fs.readFileSync('src/family-log-type-meta.ts','utf8');
const handlers=fs.readFileSync('src/settings-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const stampUi=fs.readFileSync('public/assets/settings-stamps.js','utf8');
const stampAdminApi=fs.readFileSync('src/calendar-stamp-admin-api.ts','utf8');
const contextRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { APP_VERSION } from './version';",
  "import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';",
  "import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';",
  "const SETTINGS_STAMPS_UI_REVISION='shared-publish-3';",
  'export async function settingsContent(ctx:AppContext):Promise<Response>{',
  "redirect('/login.php?next=%2Fapp%2Fsettings_content.php')",
  "taskVisibilitySql('t')",
  "taskChildVisibilitySql('i')",
  "taskChildVisibilitySql('s')",
  'ORDER BY id DESC LIMIT 30',
  'ORDER BY l.occurred_at DESC,l.id DESC LIMIT 30',
  "const own=(id:unknown)=>admin||Number(id)===m.id;",
  "section('タスク','📝',tasks",
  "section('持ち物','🎒',items",
  "section('買い物','🛒',shops",
  "section('伝言','💬',msgs",
  "section('家族ログ','🐣',familyLogs",
  "layout('投稿管理',body,'/app/settings.php')",
]) if(!page.includes(marker)) throw new Error(`settings content page lost behavior marker: ${marker}`);
if(page.includes("from './app'")) throw new Error('settings content page must not depend on app.ts');

for(const marker of [
  'const stampAdmin=admin?',
  'id="calendarStampSequenceAdmin"',
  'id="calendarStampSequenceForm"',
  'name="csrf"',
  'name="pngFrames"',
  'type="file"',
  'accept="image/png,.png"',
  'multiple',
  '2〜48枚',
  '元画像は1枚32MiB・合計128MiBまで選択でき',
  'ブラウザ内で長辺384px以下へ圧縮してからアップロードします',
  '圧縮後も全フレーム合計が1MiBを超える場合',
  'アニメーションを保ったまま全フレームを同率でさらに自動縮小します',
  'name="durationMs"',
  'name="frames"',
  '既存ASSETSのPNGパスから登録',
  'ASSETS登録はFamilyToDo内のみ',
  'id="calendarStampInventoryAdmin"',
  'id="calendarStampInventory"',
  '履歴・配置・R2画像は削除しません',
  'settings-stamps.js?v=${APP_VERSION}-${SETTINGS_STAMPS_UI_REVISION}',
]) if(!page.includes(marker)) throw new Error(`settings stamp administration marker missing: ${marker}`);
if(/R2[^<]{0,80}(?:bucket|バケット)(?:名)?[^<]{0,80}(?:input|name=)/i.test(page))throw new Error('settings stamp UI must not request physical R2 bucket identity');

for(const marker of [
  "document.getElementById('calendarStampSequenceForm')",
  "document.getElementById('calendarStampInventory')",
  "lines.length<2||lines.length>48",
  'durationMs<40||durationMs>2000',
  "files.length<2||files.length>48",
  'const MAX_UPLOAD_EDGE=384',
  'const MAX_UPLOAD_BYTES=4*1024*1024',
  'const MAX_SOURCE_FILE_BYTES=32*1024*1024',
  'const MAX_SOURCE_BYTES=128*1024*1024',
  'const MAX_NORMALIZED_BYTES=1024*1024',
  'file.size<=0||file.size>MAX_SOURCE_FILE_BYTES',
  'if(sourceBytes>MAX_SOURCE_BYTES)',
  'const prepareUploadFiles=async files=>',
  'for(let pass=0;pass<10;pass++)',
  'normalizedBytes<=MAX_NORMALIZED_BYTES',
  'Math.sqrt(MAX_NORMALIZED_BYTES/normalizedBytes)*0.92',
  '全フレームをさらに自動縮小しています',
  "fetch('/api/calendar-stamp-admin/upload'",
  "'x-csrf-token':token",
  "storageProvider='UPLOAD'",
  "fetch('/api/calendar-stamp-admin/png-sequence'",
  "fetch('/api/calendar-stamp-admin/assets'",
  "fetch('/api/calendar-stamp-admin/shared-publish'",
  "body:JSON.stringify({csrf:csrf(),assetId:Number(asset.id)})",
  "body:JSON.stringify({csrf:csrf(),assetId:Number(asset.id),active:!asset.active})",
  "credentials:'same-origin'",
  'storageProvider,',
  "thumbnailStorageKey:storageProvider==='ASSETS'",
  "payload.sharedPublished===true",
  "button.textContent=asset.active?'無効化':'有効化'",
  "publish.textContent='みてにゃと共有'",
  'await loadInventory()',
]) if(!stampUi.includes(marker)) throw new Error(`settings stamp client marker missing: ${marker}`);
if(/console\.|authorization|cookie|family_id|member_id|bucket[_-]?name|signed[_-]?url/i.test(stampUi))throw new Error('settings stamp client must not handle/log internal identity, physical storage identity, or credential details');
if(/payload\?\.(?:message|detail)|payload\.(?:message|detail)|response\.text\(/.test(stampUi))throw new Error('settings stamp UI must not surface raw server error detail');

for(const marker of [
  "import { calendarStampAssetsForAdmin } from './calendar-stamp-admin-inventory';",
  "import { setCalendarStampAssetActive } from './calendar-stamp-actions';",
  "import { publishCalendarStampToShared } from './calendar-shared-stamp-publish';",
  'export async function calendarStampAdminAssetsApi',
  'calendarStampAssetsForAdmin(context.env,s.familyId,s.memberId)',
  "thumbnailUrl:asset.active===1?calendarStampAssetUrl(asset,'thumbnail'):null",
  'sharedPublishingReady:shared.ready',
  'sharedPublished,',
  'sharedPublishCandidate,',
  'canPublishShared:shared.ready&&!sharedPublished&&sharedPublishCandidate',
  'setCalendarStampAssetActive(context.env,s.familyId,s.memberId,assetId,active)',
  "'cache-control':'private, no-store'",
  'await publishCalendarStampToShared(context.env,s.familyId,s.memberId,assetId,client);',
]) if(!stampAdminApi.includes(marker)) throw new Error(`settings stamp admin API marker missing: ${marker}`);
for(const sensitive of ['storageKey:','thumbnailStorageKey:','storage_key:','thumbnail_storage_key:','familyId:','memberId:']){
  const projectionStart=stampAdminApi.indexOf('return {\n          id:Number(asset.id)');
  const projectionEnd=projectionStart>=0?stampAdminApi.indexOf('};',projectionStart):-1;
  if(projectionStart<0||projectionEnd<0)throw new Error('settings stamp admin API projection marker missing');
  if(stampAdminApi.slice(projectionStart,projectionEnd).includes(sensitive))throw new Error(`settings stamp admin API exposes internal field ${sensitive}`);
}
if(!contextRoutes.includes("if(url.pathname==='/api/calendar-stamp-admin/assets') return await calendarStampAdminAssetsApi(request,context);"))throw new Error('settings stamp admin assets route missing');
if(!contextRoutes.includes("if(url.pathname==='/api/calendar-stamp-admin/shared-publish') return await calendarSharedStampPublishAdminApi(request,context);"))throw new Error('settings shared stamp publish route missing');

for(const marker of [
  "MILK:{icon:'🍼',label:'ミルク'}",
  "SLEEP:{icon:'😴',label:'睡眠'}",
  "HOUSEWORK:{icon:'🧹',label:'ちょこっと家事'}",
  "MEMO:{icon:'📝',label:'メモ'}",
]) if(!meta.includes(marker)) throw new Error(`Family Log display metadata lost marker: ${marker}`);

if(!handlers.includes("export { settingsContent } from './settings-content-page';")) throw new Error('settings content page handlers must export retained settingsContent');
if(!handlers.includes("export { settings } from './settings-root';")) throw new Error('top-level settings retained boundary regressed');
if(handlers.includes("from './app'")) throw new Error('settings page handlers must not depend on app.ts after recurring extraction');
if(!handlers.includes("export { recurring } from './recurring-page';")) throw new Error('recurring retained boundary missing');
if(!handlers.includes("export { settingsMembers } from './settings-members-page';")) throw new Error('settingsMembers retained boundary regressed');

if(!routes.includes("if(url.pathname==='/app/settings_content.php') return await settingsContent(context);")) throw new Error('settings-content route wiring changed');

console.log('settings content retained page boundary contract ok');