import fs from 'node:fs';

const api=fs.readFileSync('src/family-create-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { json } from './response';",
  "import { commitSession } from './session';",
  'export async function createFamily(request: Request, ctx: AppContext): Promise<Response> {',
  "request.method !== 'POST'",
  "!ctx.session.lineUserId",
  "家族名を入力してください（255文字以内）。",
  "crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()",
  'SELECT id,family_id FROM members WHERE line_user_id=? AND active=1 LIMIT 1',
  'INSERT INTO families(family_code,name,created_at,updated_at) VALUES(?,?,?,?)',
  'INSERT INTO members(family_id,line_user_id,name,member_type,role,notification_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
  "'timezone',JSON.stringify('Asia/Tokyo')",
  "'week_start',JSON.stringify('MONDAY')",
  "'default_completion_mode',JSON.stringify('ANY')",
  "json({ok:true,redirect:'/app/index.php',family_id:familyId})",
]) if(!api.includes(marker)) throw new Error(`family create API lost behavior marker: ${marker}`);
if(api.includes("from './app'")) throw new Error('family create API must not depend on app.ts');

if(!routes.includes("import { createFamily } from './family-create-api';")) throw new Error('context API dispatcher must import retained createFamily');
if(!routes.includes("if(url.pathname==='/api/family/create') return await createFamily(request,context);")) throw new Error('family create route wiring changed');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bcreateFamily\b/.test(appImport)) throw new Error('context API dispatcher must not import createFamily from app.ts');
if(/\binviteCreate\b/.test(appImport)) throw new Error('context API dispatcher must not import inviteCreate from app.ts');
if(!routes.includes("import { inviteCreate } from './family-invite-api';")) throw new Error('family invitation retained boundary is missing');

console.log('family create retained API boundary contract ok');
