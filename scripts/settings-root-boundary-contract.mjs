import fs from 'node:fs';

const handler=fs.readFileSync('src/settings-root.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const pages=fs.readFileSync('src/settings-page-handlers.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { logActivity } from './activity-log';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { commitSession } from './session';",
  'export async function settings(request:Request,ctx:AppContext):Promise<Response>{',
  "error:'ログインが必要です.',code:'AUTH_REQUIRED'".replace('です.','です。'),
  "error:'CSRF検証に失敗しました。',code:'FORBIDDEN'",
  "action==='family_timezone'",
  "action==='member_permission'",
  "action==='profile'",
  "action==='member_toggle'||action==='member_delete'",
  "UPDATE notifications SET status='cancelled'",
  'DELETE FROM task_assignees',
  'DELETE FROM item_assignees',
  'DELETE FROM shopping_assignees',
  'DELETE FROM task_completions',
  'DELETE FROM item_completions',
  'DELETE FROM shopping_completions',
  "UPDATE tasks SET status=CASE WHEN completion_mode='ALL'",
  "UPDATE items SET status=CASE WHEN completion_mode='ALL'",
  "logActivity(ctx,nextActive?'MEMBER_REACTIVATED':'MEMBER_DEACTIVATED'",
  "logActivity(ctx,'MEMBER_DELETED'",
  "action==='notification'",
  "return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);",
  "return html(layout('管理',body,'/app/settings.php'));",
]) if(!handler.includes(marker)) throw new Error(`Top-level settings handler lost behavior marker: ${marker}`);

if(handler.includes("from './app'")) throw new Error('Top-level settings handler must not depend on app.ts');
if(!routes.includes("import { settings } from './settings-root';")) throw new Error('context API dispatcher must import retained settings handler');
if(!routes.includes("if(url.pathname==='/api/settings') return await settings(request,context);")) throw new Error('/api/settings route wiring changed');
if(!pages.includes("export { settings } from './settings-root';")) throw new Error('/app/settings.php page boundary must use retained settings handler');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bsettings\b/.test(appImport)) throw new Error('context API dispatcher must not import settings from app.ts');
if(!/\brecurring\b/.test(pages.split('\n').find(line=>line.includes("from './app'"))||'')) throw new Error('recurring transition boundary moved unexpectedly');

console.log('Top-level settings retained page/API boundary contract ok');
