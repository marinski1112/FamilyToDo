import fs from 'node:fs';

const handler=fs.readFileSync('src/liff-login.ts','utf8');
const parser=fs.readFileSync('src/request-body.ts','utf8');
const routes=fs.readFileSync('src/exception-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { verifyLineIdToken } from './line';",
  "import { validateLiffNext } from './liff-target';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { commitSession } from './session';",
  "if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);",
  "if (!idToken) return json({ok:false,error:'LINE IDトークンがありません。'},400);",
  "if (!ctx.env.LINE_CHANNEL_ID) return json({ok:false,error:'LINE_CHANNEL_IDが未設定です。'},500);",
  "verifyLineIdToken(idToken, ctx.env.LINE_CHANNEL_ID)",
  "SELECT id,family_id FROM members WHERE line_user_id=? AND active=1 LIMIT 1",
  "ctx.session.csrfToken ??= crypto.randomUUID();",
  "validateLiffNext(body.next)",
  "stage:'LIFF_LOGIN_POST'",
  "flow:Boolean(body.google_home)",
  "stage:'LIFF_SESSION_COMMITTED'",
  "member?(requestedNext || '/app/index.php'):'/family/create.php'",
  "return commitSession(response,ctx.session,ctx.env.APP_SECRET);",
]) if(!handler.includes(marker)) throw new Error(`LIFF login retained handler lost behavior marker: ${marker}`);

if(handler.includes("from './app'")) throw new Error('LIFF login retained handler must not depend on app.ts');
for(const marker of [
  "contentType.includes('application/json')",
  "contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')",
  "new RequestBodyParseError('JSONが不正です。')",
  "new RequestBodyParseError('フォームデータが不正です。')",
  'new URLSearchParams(value)',
]) if(!parser.includes(marker)) throw new Error(`request-body parser lost compatibility marker: ${marker}`);
if(parser.includes("from './app'")) throw new Error('request-body parser must not depend on app.ts');
if(!handler.includes("code:'BAD_REQUEST'")) throw new Error('LIFF invalid body must preserve BAD_REQUEST response code');
if(!routes.includes("import { liffLogin } from './liff-login';")) throw new Error('exception routes must import retained LIFF login handler');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bliffLogin\b/.test(appImport)) throw new Error('exception routes must not import liffLogin from app.ts');
for(const marker of [
  "if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);",
]) if(!routes.includes(marker)) throw new Error(`LIFF login route wiring changed: ${marker}`);

console.log('LIFF login retained boundary contract ok');
