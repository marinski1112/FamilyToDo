import fs from 'node:fs';
const handler=fs.readFileSync('src/family-log-page-handler.ts','utf8');
const page=fs.readFileSync('src/family-log-page.ts','utf8');
const recurrence=fs.readFileSync('src/recurrence-projection.ts','utf8');
const api=fs.readFileSync('src/family-log-api.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const familyLogLayout=fs.readFileSync('public/assets/family-log-layout.css','utf8');
if(handler.includes("from './app'"))throw new Error('Family Log page handler still forwards to app.ts');
if(!handler.includes("export { familyLogPage as familyLog } from './family-log-page';"))throw new Error('retained Family Log page export missing');
if(!routes.includes("url.pathname==='/app/family_log.php'||url.pathname==='/app/settings_family_log.php'"))throw new Error('Family Log page routes changed');
if(!page.includes("if(request.method==='POST')return familyLogApi(request,ctx);"))throw new Error('page POST compatibility must delegate to retained mutation API');
for(const marker of [
  "pathname==='/app/settings_family_log.php'",
  "permission_key='MANAGE_QUICK_CHORES'",
  'ensureFamilyLogMemberSubjects',
  'family_log_milk_amount_presets',
  'ROW_NUMBER() OVER(PARTITION BY subject_id ORDER BY occurred_at DESC,id DESC)',
  'dashboardDays>1096',
  'ORDER BY l.occurred_at DESC,l.id DESC LIMIT 51 OFFSET ?',
  "visibility_scope='FAMILY'",
  'recurringForDate(ctx,selectedDate)',
  'familyLogPayload',
  'familyLogSubjectModal',
  'familyQuickChoreModal',
  'familyLogSettingsModal',
  'family-ai-query',
])if(!page.includes(marker))throw new Error(`Family Log retained page marker missing: ${marker}`);
for(const marker of [
  "taskVisibilitySql('t')",
  "INSERT OR IGNORE INTO recurrence_occurrences",
  "String(occ.status||'').toLowerCase()==='excluded'",
  'occ.exception_task_id',
  "mode==='ALL'?assigned>0&&completed>=assigned:completed>0",
  'recurrence_occurrence_id:Number(occ.id)',
])if(!recurrence.includes(marker))throw new Error(`retained recurrence projection marker missing: ${marker}`);
if(!api.includes('export async function familyLogApi'))throw new Error('retained Family Log mutation API missing');
if(!shell.includes("active==='/app/family_log.php'?`<link rel=\"stylesheet\" href=\"/assets/family-log-layout.css?v=${APP_VERSION}\">`:''"))throw new Error('Family Log scoped layout override is not loaded');
for(const marker of [
  '.family-log-quick-grid > .family-log-quick',
  'display:flex',
  'flex-direction:row',
  'white-space:nowrap',
  'overflow-wrap:normal',
  'word-break:keep-all',
])if(!familyLogLayout.includes(marker))throw new Error(`Family Log quick label geometry missing: ${marker}`);
console.log('family-log-page-boundary: retained page, recurrence projection, mutation delegation and quick-label geometry ok');
