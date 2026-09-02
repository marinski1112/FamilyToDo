import fs from 'node:fs';

const handler=fs.readFileSync('src/messages-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const pages=fs.readFileSync('src/message-page-handlers.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { logActivity } from './activity-log';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { commitSession } from './session';",
  "import { buildStoredTaskRange } from './task-range-safety';",
  'export async function messages(request:Request,ctx:AppContext):Promise<Response>{',
  "error:'ログインが必要です。',code:'AUTH_REQUIRED'",
  "error:'CSRF検証に失敗しました。',code:'FORBIDDEN'",
  "action==='delete'",
  "action==='edit'",
  "action==='convert_shopping'||action==='convert_task'",
  "visibility_scope='FAMILY'",
  "UPDATE notifications SET status='cancelled'",
  "INSERT OR IGNORE INTO notifications",
  "UPDATE messages SET converted_to_shopping_id=?",
  "UPDATE messages SET converted_to_task_id=?",
  "queueCalendarProjectionAfterMutation",
  "logActivity(ctx,'CONVERTED','message'",
  "const range=buildStoredTaskRange",
  "return commitSession(json({ok:true,id:tid,mode:'new'}),ctx.session,ctx.env.APP_SECRET);",
  "return html(layout('伝言',body,'/app/messages.php'));",
]) if(!handler.includes(marker)) throw new Error(`Messages handler lost behavior marker: ${marker}`);

if(handler.includes("from './app'")) throw new Error('Messages retained handler must not depend on app.ts');
if(!routes.includes("import { messages } from './messages-api';")) throw new Error('context API dispatcher must import retained messages handler');
if(!routes.includes("if(url.pathname==='/api/messages') return await messages(request,context);")) throw new Error('/api/messages route wiring changed');
if(!pages.includes("export { messages } from './messages-api';")) throw new Error('/app/messages.php page boundary must use retained messages handler');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bmessages\b/.test(appImport)) throw new Error('context API dispatcher must not import messages from app.ts');

console.log('Messages retained page/API boundary contract ok');
