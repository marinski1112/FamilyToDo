import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const diagnostics=fs.readFileSync('src/runtime-diagnostics.ts','utf8');
const activityLogPage=fs.readFileSync('src/activity-log-page.ts','utf8');
const pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');

if(!publicRoutes.includes("import { dbSchemaHealth, dbRuntimeHealth } from './runtime-diagnostics';")) throw new Error('public routes must import runtime diagnostics module');
if(!exceptionRoutes.includes("import { liffConfigDiagnose } from './runtime-diagnostics';")) throw new Error('exception routes must import authenticated LIFF diagnostics handler');
for(const name of ['dbSchemaHealth','dbRuntimeHealth','liffConfigDiagnose']){
  if(index.includes(`async function ${name}(`)) throw new Error(`${name} must not remain defined in index.ts`);
  if(!diagnostics.includes(`export async function ${name}(`)) throw new Error(`${name} must be exported from runtime-diagnostics.ts`);
}
const activityLogImport="import { logsPage } from './activity-log-page';";
if(!pageRoutes.includes(activityLogImport)) throw new Error('page dispatcher must import activity log page module');
if(index.includes('async function logsPage(')) throw new Error('logsPage must not remain defined in index.ts');
if(index.includes('activityLogVisibilitySql')) throw new Error('activity log SQL dependency must not remain in index.ts');
if(!activityLogPage.includes('export async function logsPage(')) throw new Error('logsPage must be exported from activity-log-page.ts');
if(!pageRoutes.includes("if(url.pathname==='/app/logs.php') return await logsPage(context);")) throw new Error('activity log route wiring changed');
for(const sentinel of ["activityLogVisibilitySql('a')","ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51 OFFSET ?",'activity_logsはUTC保存で31日保持です。']){
  if(!activityLogPage.includes(sentinel)) throw new Error(`activity log behavior sentinel missing: ${sentinel}`);
}
for(const route of [
  "if(url.pathname==='/__cf/db-schema-health') return await dbSchemaHealth(env);",
  "if(url.pathname==='/__cf/db-runtime-health') return await dbRuntimeHealth(env);",
]){
  if(!publicRoutes.includes(route)) throw new Error(`public diagnostics route wiring changed: ${route}`);
}
const liffDiagnosticRoute="if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return await liffConfigDiagnose(env);";
if(!exceptionRoutes.includes(liffDiagnosticRoute)) throw new Error(`authenticated diagnostics route wiring changed: ${liffDiagnosticRoute}`);
for(const sentinel of [
  "families:['id','timezone']",
  "['tasks','SELECT id,family_id,title,status,completion_mode,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,visibility_scope,private_owner_id FROM tasks LIMIT 1']",
  "`line_liff_id present: ${liffId?'YES':'NO'}`",
]){
  if(!diagnostics.includes(sentinel)) throw new Error(`diagnostics behavior sentinel missing: ${sentinel}`);
}
console.log('index entrypoint modularity contract: ok');
