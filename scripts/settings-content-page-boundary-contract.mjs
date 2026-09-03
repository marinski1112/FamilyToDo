import fs from 'node:fs';

const page=fs.readFileSync('src/settings-content-page.ts','utf8');
const meta=fs.readFileSync('src/family-log-type-meta.ts','utf8');
const handlers=fs.readFileSync('src/settings-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const stampUi=fs.readFileSync('public/assets/settings-stamps.js','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';",
  "import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';",
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
  '1枚4MiBまで',
  'name="durationMs"',
  'name="frames"',
  '既存ASSETSのPNGパスから登録',
  'src="/assets/settings-stamps.js"',
]) if(!page.includes(marker)) throw new Error(`settings stamp administration marker missing: ${marker}`);
if(/R2[^<]{0,80}(?:bucket|バケット)(?:名)?[^<]{0,80}(?:input|name=)/i.test(page))throw new Error('settings stamp UI must not request physical R2 bucket identity');

for(const marker of [
  "document.getElementById('calendarStampSequenceForm')",
  "lines.length<2||lines.length>48",
  'durationMs<40||durationMs>2000',
  "files.length<2||files.length>48",
  "file.size>4*1024*1024",
  "fetch('/api/calendar-stamp-media/upload'",
  "'x-csrf-token':csrf",
  "headers:{'content-type':'image/png','x-csrf-token':csrf}",
  "storageProvider='UPLOAD'",
  "fetch('/api/calendar-stamp-admin/png-sequence'",
  "credentials:'same-origin'",
  "headers:{'content-type':'application/json'}",
  'storageProvider,',
  "csrf,",
  "thumbnailStorageKey:storageProvider==='ASSETS'",
  "setStatus('登録しました。カレンダーと伝言のスタンプ候補に表示されます。',true)",
]) if(!stampUi.includes(marker)) throw new Error(`settings stamp client marker missing: ${marker}`);
if(/console\.|authorization|cookie|family_id|member_id|bucket[_-]?name|signed[_-]?url/i.test(stampUi))throw new Error('settings stamp client must not handle/log internal identity, physical storage identity, or credential details');
if(/payload\?\.(?:message|detail)|payload\.(?:message|detail)|response\.text\(/.test(stampUi))throw new Error('settings stamp UI must not surface raw server error detail');

for(const marker of [
  "MILK:{icon:'🍼',label:'ミルク'}",
  "SLEEP:{icon:'😴',label:'睡眠'}",
  "HOUSEWORK:{icon:'🧹',label:'ちょこっと家事'}",
  "MEMO:{icon:'📝',label:'メモ'}",
]) if(!meta.includes(marker)) throw new Error(`Family Log display metadata lost marker: ${marker}`);

if(!handlers.includes("export { settingsContent } from './settings-content-page';")) throw new Error('settings page handlers must export retained settingsContent');
if(!handlers.includes("export { settings } from './settings-root';")) throw new Error('top-level settings retained boundary regressed');
if(handlers.includes("from './app'")) throw new Error('settings page handlers must not depend on app.ts after recurring extraction');
if(!handlers.includes("export { recurring } from './recurring-page';")) throw new Error('recurring retained boundary missing');
if(!handlers.includes("export { settingsMembers } from './settings-members-page';")) throw new Error('settingsMembers retained boundary regressed');

if(!routes.includes("if(url.pathname==='/app/settings_content.php') return await settingsContent(context);")) throw new Error('settings-content route wiring changed');

console.log('settings content retained page boundary contract ok');
