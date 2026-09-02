import fs from 'node:fs';

const api=fs.readFileSync('src/family-join-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { json } from './response';",
  "import { commitSession } from './session';",
  'export async function joinFamily(request: Request, ctx: AppContext): Promise<Response> {',
  "request.method !== 'POST'",
  "!ctx.session.lineUserId",
  "error instanceof RequestBodyParseError",
  "名前は255文字以内で入力してください。",
  "家族コードまたは招待情報を入力してください。",
  "crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))",
  'i.token_hash=? AND i.used_at IS NULL AND i.expires_at>=?',
  'SELECT id,name,subject_kind,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1',
  "['BABY','CHILD','ADULT'].includes(familyLogSubjectKind(promotionSubject.subject_kind))",
  "この家族ログ対象はすでに別のLINE家族メンバーへ本登録済みです。",
  'SELECT id,deleted_at FROM members WHERE family_id=? AND line_user_id=? LIMIT 1',
  'この家族では削除済みのメンバーです。管理者に再招待を依頼してください。',
  'SELECT id,name FROM family_log_subjects WHERE family_id=? AND member_id=? AND id<>? LIMIT 1',
  "?'CHILD':'ADULT'",
  "INSERT INTO members(family_id,line_user_id,name,member_type,role,notification_enabled,active,created_at,updated_at)",
  'UPDATE family_log_subjects SET member_id=?,name=?,updated_at=? WHERE id=? AND family_id=? AND active=1 AND (member_id IS NULL OR member_id=?)',
  "'PROMOTED','family_log_subject'",
  "source:'family_log_promotion'",
  'UPDATE family_invitations SET used_at=?,used_by=? WHERE id=? AND family_id=? AND used_at IS NULL',
  'ctx.session.memberId=memberId;ctx.session.familyId=family.id;',
  "commitSession(json({ok:true,redirect:'/app/index.php',family_id:family.id,promoted_subject_id:promotionSubjectId||null}),ctx.session,ctx.env.APP_SECRET)",
]) if(!api.includes(marker)) throw new Error(`family join API lost behavior marker: ${marker}`);
if(api.includes("from './app'")) throw new Error('family join API must not depend on app.ts');

if(!routes.includes("import { joinFamily } from './family-join-api';")) throw new Error('context API dispatcher must import retained joinFamily');
if(!routes.includes("if(url.pathname==='/api/family/join') return await joinFamily(request,context);")) throw new Error('family join route wiring changed');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bjoinFamily\b/.test(appImport)) throw new Error('context API dispatcher must not import joinFamily from app.ts');
if(!/\binviteCreate\b/.test(appImport)) throw new Error('inviteCreate transition boundary moved unexpectedly');

console.log('family join retained API boundary contract ok');
