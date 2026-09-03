import fs from 'node:fs';

const api=fs.readFileSync('src/family-log-api.ts','utf8');
const boundary=fs.readFileSync('src/family-log-mutation-boundary.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { completeLinkedTargetFromFamilyLog } from './family-log-linked-completion';",
  "import { logActivity } from './activity-log';",
  "import { requestGoogleHomeSyncForFamily } from './google-home-request-sync';",
  "export async function familyLogApi(request:Request,ctx:AppContext):Promise<Response>{",
  "if(request.method!=='POST'||!ctx.member)return legacyFamilyLog(request,ctx);",
  "throw new Forbidden('CSRF検証に失敗しました。')",
  "action==='settings_update'",
  "action==='quick_chore_add'",
  "action==='quick_chore_update'",
  "action==='quick_chore_restore'",
  "action==='quick_chore_reorder'",
  "action==='quick_chore_remove'",
  "action==='quick_chore_record'",
  "action==='subject_create'||action==='subject_update'",
  "action==='subject_disable'",
  "action==='execute_quick_action'",
  "action==='quick_action_save'",
  "action==='quick_action_reorder'",
  "action==='quick_action_disable'",
  "action==='quick_record'",
  "action==='save'",
  "action==='delete'",
  "action==='timer_start'",
  "action==='sleep_start'",
  "action==='sleep_adjust'",
  "action==='sleep_stop'",
  "action==='timer_stop'",
  "action==='timer_cancel'",
  "completeLinkedTargetFromFamilyLog(ctx,linkedTaskId,linkedOccurrenceId",
  "requestGoogleHomeSyncForFamily(ctx.env,m.family_id)",
  "WHERE id=? AND family_id=?",
]) if(!api.includes(marker)) throw new Error(`Family Log retained API lost behavior marker: ${marker}`);

for(const marker of [
  "import { familyLogApi } from './family-log-api';",
  "export async function familyLogMutationBoundary(request:Request,ctx:AppContext):Promise<Response>{",
  "request.clone()",
  "String(body.action||'')!=='quick_action_disable'",
  "const expectedCsrf=String(ctx.session?.csrfToken||''),csrf=String(body.csrf||'');",
  "if(!expectedCsrf||!csrf||csrf!==expectedCsrf)return json({ok:false,error:'CSRF検証に失敗しました。'},403);",
  "if(role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'管理者のみ操作できます。'},403);",
  "SELECT id FROM family_log_quick_actions WHERE id=? AND family_id=? LIMIT 1",
  "json({ok:false,error:'クイック記録が見つかりません。'},404)",
  "return familyLogApi(request,ctx);",
]) if(!boundary.includes(marker)) throw new Error(`Family Log mutation boundary lost pre-mutation quick-action tenant guard: ${marker}`);

const guardQuery=boundary.indexOf('SELECT id FROM family_log_quick_actions WHERE id=? AND family_id=? LIMIT 1');
const mutationCall=boundary.lastIndexOf('return familyLogApi(request,ctx);');
if(guardQuery<0||mutationCall<0||guardQuery>mutationCall)throw new Error('quick-action tenant validation must occur before canonical mutation/sync execution');

if(!routes.includes("import { familyLogMutationBoundary } from './family-log-mutation-boundary';")) throw new Error('context API dispatcher must import retained Family Log mutation boundary');
if(!routes.includes("if(url.pathname==='/api/family-log') return await familyLogMutationBoundary(request,context);")) throw new Error('Family Log API route must use retained mutation boundary');
if(routes.includes("from './app'")) throw new Error('context API dispatcher must not depend on app.ts');
if(!routes.includes("import { toggle } from './toggle-api';")) throw new Error('retained toggle API boundary missing from context dispatcher');

console.log('Family Log retained mutation API boundary contract ok');
