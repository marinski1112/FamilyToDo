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

const targetLookup='SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1';
if(handler.split(targetLookup).length-1<2) throw new Error('Messages create/edit must validate recipients within the active authenticated family');
const createStart=handler.lastIndexOf("const text=String(b.text??'').trim();");
const createTargetCheck=handler.indexOf(targetLookup,createStart);
const createInsert=handler.indexOf('INSERT INTO messages(family_id,sender_id,target_member_id',createStart);
if(createStart<0||createTargetCheck<0||createInsert<0||createTargetCheck>createInsert) throw new Error('Messages create must validate target_member_id before INSERT');
if(!handler.includes('LEFT JOIN members r ON r.id=msg.target_member_id AND r.family_id=msg.family_id')) throw new Error('Messages recipient display JOIN must remain family-scoped');

if(handler.includes("from './app'")) throw new Error('Messages retained handler must not depend on app.ts');
if(!routes.includes("import { messages } from './messages-api';")) throw new Error('context API dispatcher must import retained messages handler');
if(!routes.includes("if(url.pathname==='/api/messages') return await messages(request,context);")) throw new Error('/api/messages route wiring changed');
if(!pages.includes("export { messages } from './messages-api';")) throw new Error('/app/messages.php page boundary must use retained messages handler');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bmessages\b/.test(appImport)) throw new Error('context API dispatcher must not import messages from app.ts');

console.log('Messages retained page/API boundary contract ok');
