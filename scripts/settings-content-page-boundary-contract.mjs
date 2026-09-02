import fs from 'node:fs';

const page=fs.readFileSync('src/settings-content-page.ts','utf8');
const meta=fs.readFileSync('src/family-log-type-meta.ts','utf8');
const handlers=fs.readFileSync('src/settings-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

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
  "MILK:{icon:'🍼',label:'ミルク'}",
  "SLEEP:{icon:'😴',label:'睡眠'}",
  "HOUSEWORK:{icon:'🧹',label:'ちょこっと家事'}",
  "MEMO:{icon:'📝',label:'メモ'}",
]) if(!meta.includes(marker)) throw new Error(`Family Log display metadata lost marker: ${marker}`);

if(!handlers.includes("export { settingsContent } from './settings-content-page';")) throw new Error('settings page handlers must export retained settingsContent');
const appExport=handlers.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bsettingsContent\b/.test(appExport)) throw new Error('settingsContent must not remain exported from app.ts');
for(const transitional of ['settings','settingsDiagnostics','settingsNotifications','recurring']) if(!new RegExp(`\\b${transitional}\\b`).test(appExport)) throw new Error(`${transitional} transition boundary moved unexpectedly`);
if(!handlers.includes("export { settingsMembers } from './settings-members-page';")) throw new Error('settingsMembers retained boundary regressed');

if(!routes.includes("if(url.pathname==='/app/settings_content.php') return await settingsContent(context);")) throw new Error('settings-content route wiring changed');

console.log('settings content retained page boundary contract ok');
