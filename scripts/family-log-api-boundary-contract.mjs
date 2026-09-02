import fs from 'node:fs';

const api=fs.readFileSync('src/family-log-api.ts','utf8');
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
  "visibility",
  "completeLinkedTargetFromFamilyLog(ctx,linkedTaskId,linkedOccurrenceId",
  "requestGoogleHomeSyncForFamily(ctx.env,m.family_id)",
  "WHERE id=? AND family_id=?",
]) if(!api.includes(marker)) throw new Error(`Family Log retained API lost behavior marker: ${marker}`);

if(!routes.includes("import { familyLogApi } from './family-log-api';")) throw new Error('context API dispatcher must import retained familyLogApi');
if(!routes.includes("if(url.pathname==='/api/family-log') return await familyLogApi(request,context);")) throw new Error('Family Log API route must use retained familyLogApi');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bfamilyLog\b/.test(appImport)) throw new Error('context API dispatcher must not import familyLog from app.ts');
if(!/\btoggle\b/.test(appImport)) throw new Error('toggle remains the only expected transitional context API app.ts dependency');
for(const old of ['messages','shopping','settings','inviteCreate','recordOccurrenceFamilyLog']) if(new RegExp(`\\b${old}\\b`).test(appImport)) throw new Error(`${old} must not regress into the context app.ts import`);

console.log('Family Log retained mutation API boundary contract ok');
