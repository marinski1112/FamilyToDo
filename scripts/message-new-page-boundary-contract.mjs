import fs from 'node:fs';

const page=fs.readFileSync('src/message-new-page.ts','utf8');
const handlers=fs.readFileSync('src/message-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { html, redirect } from './response';",
  "import { APP_VERSION } from './version';",
  'export async function messageNew(ctx:AppContext):Promise<Response>{',
  "redirect('/login.php?next=%2Fapp%2Fmessage_new.php')",
  'SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id',
  '<form id="messageNew">',
  'name="csrf"',
  'name="target_member_id"',
  '<option value="0">家族全員</option>',
  '<textarea name="text" maxlength="5000" required autofocus',
  'type="datetime-local" name="reminder_at"',
  '/assets/message-new.js?v=${APP_VERSION}',
  "layout('伝言',body,'/app/messages.php')",
]) if(!page.includes(marker)) throw new Error(`message-new page lost behavior marker: ${marker}`);
if(page.includes("from './app'")) throw new Error('message-new page must not depend on app.ts');

if(!handlers.includes("export { messageNew } from './message-new-page';")) throw new Error('message page handlers must export retained messageNew');
const appExport=handlers.split('\n').find(line=>line.includes("from './app'"))||'';
if(!/\bmessages\b/.test(appExport)) throw new Error('messages transitional export moved unexpectedly');
if(/\bmessageNew\b/.test(appExport)) throw new Error('messageNew must not remain exported from app.ts');

if(!routes.includes("import { messages, messageNew } from './message-page-handlers';")) throw new Error('page dispatcher message handler import changed');
if(!routes.includes("if(url.pathname==='/app/message_new.php') return await messageNew(context);")) throw new Error('message-new route wiring changed');

console.log('message-new retained page boundary contract ok');
