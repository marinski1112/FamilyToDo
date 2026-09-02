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
if(routes.includes("from './app'")) throw new Error('context API dispatcher must not depend on app.ts');
for(const marker of [
  "import { inviteCreate } from './family-invite-api';",
  "import { recordOccurrenceFamilyLog } from './family-log-occurrence-api';",
  "import { messages } from './messages-api';",
  "import { settings } from './settings-root';",
  "import { shopping } from './shopping-root';",
  "import { familyLogApi } from './family-log-api';",
  "import { toggle } from './toggle-api';",
]) if(!routes.includes(marker)) throw new Error(`retained context API boundary missing: ${marker}`);

console.log('Web Push retained API boundary contract ok');
