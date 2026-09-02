import fs from 'node:fs';

const api=fs.readFileSync('src/family-invite-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { logActivity } from './activity-log';",
  "import { lineOfficialAccountInfo } from './line-official-account';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { json } from './response';",
  'export async function inviteCreate(request:Request,ctx:AppContext):Promise<Response>{',
  "!m)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401)",
  "request.method!=='POST'",
  "error instanceof RequestBodyParseError",
  "code:'BAD_REQUEST'",
  "ctx.session.csrfToken=crypto.randomUUID()",
  "code:'FORBIDDEN'",
  "role!=='OWNER'&&role!=='ADMIN'",
  "action==='revoke'",
  'SELECT id,used_at,family_log_subject_id FROM family_invitations WHERE id=? AND family_id=? LIMIT 1',
  'UPDATE family_invitations SET expires_at=? WHERE id=? AND family_id=? AND used_at IS NULL',
  "logActivity(ctx,'REVOKED','family_invitation'",
  'SELECT id,name,subject_kind,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1',
  "['BABY','CHILD','ADULT'].includes(familyLogSubjectKind(subject.subject_kind))",
  'Math.min(30,Math.max(1,Number(b.expires_days||7)))',
  "crypto.randomUUID().replaceAll('-','')",
  "crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))",
  'UPDATE family_invitations SET expires_at=? WHERE family_id=? AND family_log_subject_id=? AND used_at IS NULL AND expires_at>?',
  'INSERT INTO family_invitations(family_id,token_hash,created_by,expires_at,created_at,family_log_subject_id) VALUES(?,?,?,?,?,?)',
  "ctx.env.APP_URL||new URL(ctx.request.url).origin",
  'lineOfficialAccountInfo(ctx.env)',
  "logActivity(ctx,'CREATED','family_invitation'",
  "logActivity(ctx,'INVITED','family_log_subject'",
  '/family/join.php?token=',
  'official_account:official',
  'subject_kind:familyLogSubjectKind(subject?.subject_kind)',
]) if(!api.includes(marker)) throw new Error(`family invite API lost behavior marker: ${marker}`);
if(api.includes("from './app'")) throw new Error('family invite API must not depend on app.ts');
if(api.includes('logInviteActivity')) throw new Error('family invite API must not keep a duplicate activity log writer');
if(api.includes('console.error')) throw new Error('family invite API must not emit raw activity-log exceptions');

if(!routes.includes("import { inviteCreate } from './family-invite-api';")) throw new Error('context API dispatcher must import retained inviteCreate');
if(!routes.includes("if(url.pathname==='/api/family/invite') return await inviteCreate(request,context);")) throw new Error('family invite route wiring changed');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\binviteCreate\b/.test(appImport)) throw new Error('context API dispatcher must not import inviteCreate from app.ts');

console.log('family invite retained API boundary contract ok');
