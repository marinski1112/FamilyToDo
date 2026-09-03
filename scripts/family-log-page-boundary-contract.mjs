import fs from 'node:fs';
const handler=fs.readFileSync('src/family-log-page-handler.ts','utf8');
const page=fs.readFileSync('src/family-log-page.ts','utf8');
const recurrence=fs.readFileSync('src/recurrence-projection.ts','utf8');
const api=fs.readFileSync('src/family-log-api.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const familyLogLayout=fs.readFileSync('public/assets/family-log-layout.css','utf8');
const familyLogJs=fs.readFileSync('public/assets/family-log.js','utf8');
const familyLogCore=fs.readFileSync('public/assets/family-log-core.js','utf8');
const familyLogManagementUi=fs.readFileSync('public/assets/family-log-management-ui.js','utf8');
if(handler.includes("from './app'"))throw new Error('Family Log page handler still forwards to app.ts');
for(const marker of [
  "import { familyLogMutationBoundary } from './family-log-mutation-boundary';",
  "import { familyLogPage } from './family-log-page';",
  'export async function familyLog(request:Request,ctx:AppContext):Promise<Response>{',
  "if(request.method==='POST')return familyLogMutationBoundary(request,ctx);",
  'return familyLogPage(request,ctx);',
])if(!handler.includes(marker))throw new Error(`retained Family Log page handler marker missing: ${marker}`);
if(!routes.includes("url.pathname==='/app/family_log.php'||url.pathname==='/app/settings_family_log.php'"))throw new Error('Family Log page routes changed');
if(!page.includes("if(request.method==='POST')return familyLogApi(request,ctx);"))throw new Error('retained page compatibility POST path changed');
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
if(!familyLogLayout.includes('.family-log-timeline .family-log-edit')||!familyLogLayout.includes('display:none'))throw new Error('Family Log history must hide the redundant explicit edit button');
for(const marker of [
  "document.querySelectorAll('.family-log-row')",
  "if(e.target.closest('a,button,input'))return;",
  'openEdit(Number(row.dataset.id||0));',
])if(!familyLogCore.includes(marker))throw new Error(`Family Log row-tap edit behavior missing: ${marker}`);
for(const marker of [
  "!Number(payload.selectedSubject||0)&&!payload.adultAggregate",
  "const actions=Array.isArray(payload.quickActions)?payload.quickActions:[]",
  "const eligibleSubjects=Object.values(subjects).filter",
  "const displayPrefix=subject=>",
  "Number(action?.subject_id)===Number(subject.id)",
  "String(action?.mode||'QUICK')!=='SLEEP_TOGGLE'",
  "family-log-unified-quick-group",
  "section.dataset.subjectId=String(Number(subject.id))",
  "family-log-quick-action':'family-log-form-action'",
  "button.dataset.quickActionId",
  'const authoritativeSubjects=[]',
  'const matchingSubjects=eligibleSubjects.filter(subject=>displayPrefix(subject)===authority.subjectPrefix)',
  'if(matchingSubjects.length!==1)continue',
  "String(section.querySelector('h2')?.textContent||'').trim()===authority.subjectPrefix",
  'if(matches.length!==1)continue',
  "legacy.querySelectorAll('.family-log-sleep-start,.family-log-sleep-stop')",
  'grid?.appendChild(control)',
  "legacy.remove()",
  "overview.prepend(groups[i])",
])if(!familyLogJs.includes(marker))throw new Error(`Family Log overview quick-action consumer missing: ${marker}`);
if(familyLogJs.includes('heading.startsWith(prefix)'))throw new Error('Family Log overview must not remove legacy palettes by ambiguous heading prefix');
if(!familyLogJs.includes('Any name/icon collision preserves the fallback'))throw new Error('Family Log overview must preserve fallback when multiple subjects share display identity');
if(/DELETE FROM family_logs|UPDATE family_logs SET deleted_at/.test(familyLogJs))throw new Error('overview quick-action consumer must not mutate or delete retained history directly');
for(const marker of [
  "location.pathname!=='/app/settings_family_log.php'",
  "const quickActions=Array.isArray(payload.quickActions)?payload.quickActions:[];",
  "const subjects=payload.subjects&&typeof payload.subjects==='object'?payload.subjects:{};",
  "quickManageTitle.textContent='クイックタスク'",
  "quickAdd.textContent='＋ クイックタスク'",
  "allQuickCard.className='card family-log-all-quick-tasks'",
  'すべての対象のクイックタスクをここから確認・管理できます。',
  "subjects[String(subjectId)]||null",
  "href=\"/app/settings_family_log.php?subject=${subjectId}\"",
  "inactive?' · 非表示':''",
  "subjectForm?.elements.namedItem('subject_kind')",
  "const hideLegacyControl=element=>",
  "element.style.display='none'",
  "hideLegacyControl(subjectKind)",
  "hideLegacyControl(typeHead)",
  "hideLegacyControl(typeGrid)",
  "hideLegacyControl(overviewToggle)",
  "hideLegacyControl(overviewTypes)",
  "subjectCardTitle.textContent='記録対象'",
  "trigger.textContent='＋ 対象'",
  'compatibility metadata',
])if(!familyLogManagementUi.includes(marker))throw new Error(`Family Log all Quick Tasks management marker missing: ${marker}`);
if(/通常タスク/.test(familyLogManagementUi))throw new Error('Family Log management must not advertise the retired normal-task model');
if(/fetch\(|XMLHttpRequest|DELETE FROM|UPDATE family_logs/.test(familyLogManagementUi))throw new Error('Family Log management navigation must reuse retained tenant-scoped page/API behavior instead of mutating data directly');
console.log('family-log-page-boundary: retained page GET, guarded page POST, recurrence projection, quick-label geometry, row-tap edit with redundant button hidden, sleep preservation, subject-collision-safe overview quick actions, force-hidden legacy subject controls and all-Quick-Tasks management ok');
