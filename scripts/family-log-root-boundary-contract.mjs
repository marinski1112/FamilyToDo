import fs from 'node:fs';

const root=fs.readFileSync('src/family-log-root.ts','utf8');
const support=fs.readFileSync('src/family-log-support.ts','utf8');
const errors=fs.readFileSync('src/family-log-errors.ts','utf8');
const handlers=fs.readFileSync('src/family-log-page-handler.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const [label,source] of [['root',root],['support',support],['errors',errors]]){
  if(source.includes("from './app'")) throw new Error(`Family Log ${label} must not depend on app.ts`);
}
for(const marker of [
  "action==='settings_update'",
  "action==='quick_chore_add'",
  "action==='quick_chore_update'",
  "action==='quick_chore_remove'",
  "action==='quick_chore_restore'",
  "action==='quick_chore_reorder'",
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
  'completeLinkedTargetFromFamilyLog',
  'requestGoogleHomeSyncForFamily',
  'recurringForDate(ctx,selectedDate)',
  "visibility_scope='FAMILY'",
  "code:'AUTH_REQUIRED'",
  "code:'BAD_REQUEST'",
  "code:'FORBIDDEN'",
  "id=\"familyLogPayload\"",
  "id=\"familyAiPayload\"",
]) if(!root.includes(marker)) throw new Error(`Family Log root lost behavior marker: ${marker}`);
for(const marker of [
  'export async function recordQuickChoreDomain',
  'export async function startDedicatedSleepDomain',
  'export async function stopDedicatedSleepDomain',
  'export async function recurringForDate',
  "INSERT OR IGNORE INTO recurrence_occurrences",
  "recurrence_occurrence_completions",
  "taskVisibilitySql('t')",
  "MONTHLY_BUSINESS_DAY",
  "振替休日",
]) if(!support.includes(marker)) throw new Error(`Family Log support lost behavior marker: ${marker}`);
if(!handlers.includes("export { familyLog } from './family-log-root';")) throw new Error('Family Log page handler must use retained root');
if(handlers.includes("from './app'")) throw new Error('Family Log page handler must not depend on app.ts');
if(!routes.includes("import { familyLog } from './family-log-root';")) throw new Error('Family Log API must use retained root');
if(!routes.includes("if(url.pathname==='/api/family-log') return await familyLog(request,context);")) throw new Error('Family Log API route changed');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bfamilyLog\b/.test(appImport)) throw new Error('Family Log must not remain in context app.ts import');
if(appImport.trim()!=="import { toggle } from './app';") throw new Error(`unexpected remaining context app.ts boundary: ${appImport}`);

console.log('Family Log retained root boundary contract ok');
