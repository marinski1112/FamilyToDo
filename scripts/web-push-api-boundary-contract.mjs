import fs from 'node:fs';

const api=fs.readFileSync('src/web-push-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { sendWebPush, webPushConfigured } from './webpush';",
  'export async function webPushApi(request:Request,ctx:AppContext):Promise<Response>{',
  "error:'ログインが必要です。',code:'AUTH_REQUIRED'",
  "request.method!=='POST'",
  "error instanceof RequestBodyParseError",
  "code:'BAD_REQUEST'",
  "code:'FORBIDDEN'",
  "action==='subscribe'",
  "parsed.protocol!=='https:'",
  'endpoint.length>2500',
  'p256dh.length>500',
  'auth.length>500',
  'ON CONFLICT(member_id,endpoint) DO UPDATE SET family_id=excluded.family_id',
  "notification_channel='WEB_PUSH'",
  "action==='unsubscribe'",
  "notification_channel='LINE'",
  "action==='test'",
  'ORDER BY id DESC LIMIT 10',
  "title:'Family TODO LINE',body:'Web Pushのテスト通知です。',url:'/app/tasks.php',tag:'familytodo-test'",
  'failure_count=failure_count+1',
  "error:'Unknown push action'",
]) if(!api.includes(marker)) throw new Error(`Web Push API lost behavior marker: ${marker}`);
if(api.includes("from './app'")) throw new Error('Web Push API must not depend on app.ts');

if(!routes.includes("import { webPushApi } from './web-push-api';")) throw new Error('context API dispatcher must import retained webPushApi');
if(!routes.includes("if(url.pathname==='/api/push/subscribe'||url.pathname==='/api/push/unsubscribe'||url.pathname==='/api/push/test') return await webPushApi(request,context);")) throw new Error('Web Push route wiring changed');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bwebPushApi\b/.test(appImport)) throw new Error('context API dispatcher must not import webPushApi from app.ts');
if(/\binviteCreate\b/.test(appImport)) throw new Error('context API dispatcher must not import inviteCreate from app.ts');
if(/\brecordOccurrenceFamilyLog\b/.test(appImport)) throw new Error('context API dispatcher must not import recordOccurrenceFamilyLog from app.ts');
if(/\bmessages\b/.test(appImport)) throw new Error('context API dispatcher must not import messages from app.ts');
if(/\bsettings\b/.test(appImport)) throw new Error('context API dispatcher must not import settings from app.ts');
if(/\bshopping\b/.test(appImport)) throw new Error('context API dispatcher must not import shopping from app.ts');
if(/\bfamilyLog\b/.test(appImport)) throw new Error('context API dispatcher must not import familyLog from app.ts');
if(!routes.includes("import { inviteCreate } from './family-invite-api';")) throw new Error('family invitation retained boundary is missing');
if(!routes.includes("import { recordOccurrenceFamilyLog } from './family-log-occurrence-api';")) throw new Error('recurrence Family Log retained boundary is missing');
if(!routes.includes("import { messages } from './messages-api';")) throw new Error('messages retained boundary is missing');
if(!routes.includes("import { settings } from './settings-root';")) throw new Error('settings retained boundary is missing');
if(!routes.includes("import { shopping } from './shopping-root';")) throw new Error('shopping retained boundary is missing');
if(!routes.includes("import { familyLogApi } from './family-log-api';")) throw new Error('Family Log retained API boundary is missing');
if(!/\btoggle\b/.test(appImport)) throw new Error('toggle transition boundary moved unexpectedly');

console.log('Web Push retained API boundary contract ok');
