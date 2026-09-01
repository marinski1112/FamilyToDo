import fs from 'node:fs';

const indexPath='src/index.ts';
const modulePath='src/context-api-routes.ts';
const contractPath='scripts/context-api-route-dispatcher-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

const routeLines=[
  "if(url.pathname==='/api/family/create') return await createFamily(request,context);",
  "if(url.pathname==='/api/family/join') return await joinFamily(request,context);",
  "if(url.pathname==='/api/family/invite') return await inviteCreate(request,context);",
  "if(url.pathname==='/api/me') return await apiMe(context);",
  "if(url.pathname==='/api/toggle') return await toggle(request,context);",
  "if(url.pathname==='/api/task') return await taskApi(request,context);",
  "if(url.pathname==='/api/item') return await itemApi(request,context);",
  "if(url.pathname==='/api/messages') return await messages(request,context);",
  "if(url.pathname==='/api/shopping') return await shopping(request,context);",
  "if(url.pathname==='/api/family-log') return await familyLog(request,context);",
  "if(url.pathname==='/api/child-journal') return await childJournalApi(request,context);",
  "if(url.pathname==='/api/family-ai/query') return await familyAiQuery(request,context);",
  "if(url.pathname==='/api/family-ai/plan') return await familyAiPlan(request,context);",
  "if(url.pathname==='/api/family-ai/execute') return await familyAiExecute(request,context);",
  "if(url.pathname==='/api/family-ai/connection-test') return await familyAiConnectionTest(request,context);",
  "if(url.pathname==='/api/family-ai/model-probe') return await familyAiModelProbe(request,context);",
  "if(url.pathname==='/api/family-ai/model-catalog') return await familyAiModelCatalog(request,context);",
  "if(url.pathname==='/api/family-ai/model-compatibility') return await familyAiModelCompatibility(request,context);",
  "if(url.pathname==='/api/family-ai/model-select') return await familyAiModelSelect(request,context);",
  "if(url.pathname==='/api/family-ai/model-reset') return await familyAiModelReset(request,context);",
  "if(url.pathname==='/api/settings/diagnostics-detail') return await settingsDiagnosticsDetail(request,context);",
  "if(url.pathname==='/api/google-tasks/action') return await googleTasksAction(request,context);",
  "if(url.pathname==='/api/google-calendar/sync') return await calendarSyncNow(request,context);",
  "if(url.pathname==='/api/google-calendar/backfill') return await calendarBackfill(request,context);",
  "if(url.pathname==='/api/google-calendar/disconnect') return await calendarDisconnect(request,context);",
  "if(url.pathname==='/api/google-calendar/retry-failed') return await calendarRetryFailed(request,context);",
  "if(url.pathname==='/api/family-log-import') return await familyLogImportApi(request,context);",
  "if(url.pathname==='/api/calendar-import/preview') return await calendarImportPreview(request,context);",
  "if(url.pathname==='/api/calendar-import/normalization-preview') return await calendarImportNormalizationPreview(request,context);",
  "if(url.pathname==='/api/calendar-import/prepare') return await calendarImportPrepare(request,context);",
  "if(url.pathname==='/api/calendar-import/status') return await calendarImportStatus(request,context);",
  "if(url.pathname==='/api/calendar-import/apply') return await calendarImportApply(request,context);",
  "if(url.pathname==='/api/calendar-import/rollback') return await calendarImportRollback(request,context);",
  "if(url.pathname==='/api/recurrence/family-log-complete') return await recordOccurrenceFamilyLog(request,context);",
  "if(url.pathname==='/api/settings') return await settings(request,context);",
  "if(url.pathname==='/api/push/subscribe'||url.pathname==='/api/push/unsubscribe'||url.pathname==='/api/push/test') return await webPushApi(request,context);",
];

let index=fs.readFileSync(indexPath,'utf8');
const lines=index.split('\n');
const selectedIndexes=routeLines.map(route=>{
  const matches=[];
  lines.forEach((line,i)=>{ if(line.trim()===route) matches.push(i); });
  if(matches.length!==1) throw new Error(`expected one route line for ${route}, found ${matches.length}`);
  return matches[0];
});
for(let i=1;i<selectedIndexes.length;i++){
  if(selectedIndexes[i]!==selectedIndexes[i-1]+1) throw new Error(`context API route block is no longer contiguous at ${routeLines[i]}`);
}

for(const required of [
  "if(url.pathname==='/api/google-calendar/watch') return await calendarWatchWebhook(request,env,ctx);",
  "if(url.pathname==='/api/google-home/fulfillment') return await googleFulfillment(request,env);",
  "if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);",
  "const pageResponse=await dispatchPageRoute(request,context,env,url);",
  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",
]) if(!index.includes(required)) throw new Error(`routing boundary sentinel missing: ${required}`);

const moduleHeader=`import { createFamily, joinFamily, inviteCreate, apiMe, toggle, messages, shopping, familyLog, settingsDiagnosticsDetail, recordOccurrenceFamilyLog, settings, webPushApi } from './app';
import { taskApi } from './task-api';
import { itemApi } from './item-api';
import { childJournalApi } from './child-journal';
import { familyAiQuery, familyAiPlan, familyAiExecute, familyAiConnectionTest, familyAiModelProbe, familyAiModelCatalog, familyAiModelCompatibility, familyAiModelSelect, familyAiModelReset } from './family-ai';
import { googleTasksAction } from './google-tasks';
import { calendarSyncNow, calendarBackfill, calendarDisconnect, calendarRetryFailed } from './google-calendar';
import { familyLogImportApi } from './family-log-import';
import { calendarImportPreview, calendarImportNormalizationPreview, calendarImportPrepare, calendarImportStatus, calendarImportApply, calendarImportRollback } from './calendar-ics-import';

export async function dispatchContextApiRoute(request:Request,context:any,url:URL):Promise<Response|null>{
`;
const moduleBody=routeLines.map(route=>`  ${route}`).join('\n');
fs.writeFileSync(modulePath,`${moduleHeader}${moduleBody}\n  return null;\n}\n`);

const start=selectedIndexes[0];
const end=selectedIndexes[selectedIndexes.length-1];
const replacement=[
  '      const apiResponse=await dispatchContextApiRoute(request,context,url);',
  '      if(apiResponse) return apiResponse;',
];
lines.splice(start,end-start+1,...replacement);
index=lines.join('\n');
const importAnchor="import { dispatchPageRoute } from './page-routes';\n";
if(!index.includes(importAnchor)) throw new Error('page route import anchor missing');
index=index.replace(importAnchor,importAnchor+"import { dispatchContextApiRoute } from './context-api-routes';\n");
for(const route of routeLines){
  if(index.split('\n').some(line=>line.trim()===route)) throw new Error(`context API route remained in index.ts: ${route}`);
}
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
if(!index.includes("import { dispatchContextApiRoute } from './context-api-routes';")) throw new Error('index.ts must import context API dispatcher');
if(!index.includes('const apiResponse=await dispatchContextApiRoute(request,context,url);')) throw new Error('index.ts must invoke context API dispatcher');
if(!index.includes('if(apiResponse) return apiResponse;')) throw new Error('index.ts must return matched context API response');
if(!apiRoutes.includes('export async function dispatchContextApiRoute(request:Request,context:any,url:URL):Promise<Response|null>{')) throw new Error('context API dispatcher export missing');
const routeLines=${JSON.stringify(routeLines,null,2)};
for(const route of routeLines){
  if(!apiRoutes.includes(route)) throw new Error(\`context API dispatcher route missing: \${route}\`);
  if(index.split('\\n').some(line=>line.trim()===route)) throw new Error(\`context API route must not remain in index.ts: \${route}\`);
}
for(const required of [
  "if(url.pathname==='/api/google-calendar/watch') return await calendarWatchWebhook(request,env,ctx);",
  "if(url.pathname==='/api/google-home/fulfillment') return await googleFulfillment(request,env);",
  "if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);",
  'const pageResponse=await dispatchPageRoute(request,context,env,url);',
  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",
]) if(!index.includes(required)) throw new Error(\`routing boundary moved unexpectedly: \${required}\`);
if(!apiRoutes.includes('return null;')) throw new Error('unmatched context API route must fall through');
console.log('context API route dispatcher contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['page-route-dispatcher','node scripts/page-route-dispatcher-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('regression manifest page route anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['context-api-route-dispatcher','node scripts/context-api-route-dispatcher-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

function replaceOnce(path,from,to){
  let source=fs.readFileSync(path,'utf8');
  const count=source.split(from).length-1;
  if(count!==1) throw new Error(`${path}: expected one responsibility marker, found ${count}: ${from}`);
  source=source.replace(from,to);
  fs.writeFileSync(path,source);
}

replaceOnce('scripts/item-api-modularity-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst itemApi=fs.readFileSync('src/item-api.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');\nconst itemApi=fs.readFileSync('src/item-api.ts','utf8');");
replaceOnce('scripts/item-api-modularity-contract.mjs',
  "if(!index.includes(\"import { itemApi } from './item-api';\")) throw new Error('index.ts must import item API module');",
  "if(!apiRoutes.includes(\"import { itemApi } from './item-api';\")) throw new Error('context API dispatcher must import item API module');");
replaceOnce('scripts/item-api-modularity-contract.mjs',
  "if(!index.includes(\"if(url.pathname==='/api/item') return await itemApi(request,context);\")) throw new Error('item API route wiring changed');",
  "if(!apiRoutes.includes(\"if(url.pathname==='/api/item') return await itemApi(request,context);\")) throw new Error('item API route wiring changed');");

replaceOnce('scripts/task-api-modularity-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst taskApi=fs.readFileSync('src/task-api.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');\nconst taskApi=fs.readFileSync('src/task-api.ts','utf8');");
replaceOnce('scripts/task-api-modularity-contract.mjs',
  "if(!index.includes(\"import { taskApi } from './task-api';\")) throw new Error('index.ts must import task API module');",
  "if(!apiRoutes.includes(\"import { taskApi } from './task-api';\")) throw new Error('context API dispatcher must import task API module');");
replaceOnce('scripts/task-api-modularity-contract.mjs',
  "if(!index.includes(\"if(url.pathname==='/api/task') return await taskApi(request,context);\")) throw new Error('task API route wiring changed');",
  "if(!apiRoutes.includes(\"if(url.pathname==='/api/task') return await taskApi(request,context);\")) throw new Error('task API route wiring changed');");

replaceOnce('scripts/page-route-dispatcher-contract.mjs',
  "const pages=fs.readFileSync('src/page-routes.ts','utf8');",
  "const pages=fs.readFileSync('src/page-routes.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');");
replaceOnce('scripts/page-route-dispatcher-contract.mjs',
  "for(const required of [\n  \"if(url.pathname==='/api/toggle') return await toggle(request,context);\",",
  "if(!apiRoutes.includes(\"if(url.pathname==='/api/toggle') return await toggle(request,context);\")) throw new Error('context API toggle routing changed');\nfor(const required of [");

replaceOnce('scripts/child-growth-journal-contract.mjs',
  "const pageRoutes=fs.readFileSync(new URL('../src/page-routes.ts',import.meta.url),'utf8');",
  "const pageRoutes=fs.readFileSync(new URL('../src/page-routes.ts',import.meta.url),'utf8');\nconst apiRoutes=fs.readFileSync(new URL('../src/context-api-routes.ts',import.meta.url),'utf8');");
replaceOnce('scripts/child-growth-journal-contract.mjs',
  "if(!index.includes(\"url.pathname==='/api/child-journal'\"))throw new Error('Worker must route the Child Journal write boundary');",
  "if(!apiRoutes.includes(\"url.pathname==='/api/child-journal'\"))throw new Error('Worker must route the Child Journal write boundary');");

replaceOnce('scripts/calendar-projection-queue-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst app=fs.readFileSync('src/app.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');\nconst app=fs.readFileSync('src/app.ts','utf8');");
replaceOnce('scripts/calendar-projection-queue-contract.mjs',
  "assert.ok(index.includes(\"'/api/google-calendar/backfill'\"),'Calendar backfill route must remain registered');",
  "assert.ok(apiRoutes.includes(\"'/api/google-calendar/backfill'\"),'Calendar backfill route must remain registered');");

replaceOnce('scripts/ics-import-contract.mjs',
  "const routes=fs.readFileSync('src/index.ts','utf8');",
  "const routes=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');");
replaceOnce('scripts/ics-import-contract.mjs',
  "for(const route of ['/api/calendar-import/preview','/api/calendar-import/normalization-preview','/api/calendar-import/apply','/api/calendar-import/rollback']){assert.ok(routes.includes(route),`missing route ${route}`);assert.ok(routes.includes('return await calendarImport'),`calendar import routing must remain delegated: ${route}`);}",
  "for(const route of ['/api/calendar-import/preview','/api/calendar-import/normalization-preview','/api/calendar-import/apply','/api/calendar-import/rollback']){assert.ok(apiRoutes.includes(route),`missing route ${route}`);assert.ok(apiRoutes.includes('return await calendarImport'),`calendar import routing must remain delegated: ${route}`);}");
replaceOnce('scripts/ics-import-contract.mjs',
  "assert.match(routes,/calendar-import\\/prepare/);assert.match(routes,/calendar-import\\/status/);",
  "assert.match(apiRoutes,/calendar-import\\/prepare/);assert.match(apiRoutes,/calendar-import\\/status/);");

replaceOnce('scripts/ics-import-format-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');\nconst pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');");
replaceOnce('scripts/ics-import-format-contract.mjs',
  "]) assert.ok(index.includes(route),route);",
  "]) assert.ok(apiRoutes.includes(route),route);");

replaceOnce('scripts/google-calendar-inbound-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');");
replaceOnce('scripts/google-calendar-inbound-contract.mjs',
  "for(const marker of [\"'/api/google-calendar/sync'\",'processCalendarInbound(env)']) assert.ok(index.includes(marker),marker);",
  "assert.ok(apiRoutes.includes(\"'/api/google-calendar/sync'\"),'/api/google-calendar/sync');\nassert.ok(index.includes('processCalendarInbound(env)'),'processCalendarInbound(env)');");

replaceOnce('scripts/family-ai-actions-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');");
replaceOnce('scripts/family-ai-actions-contract.mjs',
  "for(const path of ['/api/family-ai/plan','/api/family-ai/execute']) assert.ok(index.includes(path),path);",
  "for(const path of ['/api/family-ai/plan','/api/family-ai/execute']) assert.ok(apiRoutes.includes(path),path);");

replaceOnce('scripts/family-ai-provider-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');");
replaceOnce('scripts/family-ai-provider-contract.mjs',
  "assert.ok(index.includes('/api/family-ai/model-catalog'));\nassert.ok(index.includes('/api/family-ai/model-probe'));",
  "assert.ok(apiRoutes.includes('/api/family-ai/model-catalog'));\nassert.ok(apiRoutes.includes('/api/family-ai/model-probe'));");

replaceOnce('scripts/family-ai-foundation-contract.mjs',
  "const index=fs.readFileSync('src/index.ts','utf8');",
  "const index=fs.readFileSync('src/index.ts','utf8');\nconst apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');");
replaceOnce('scripts/family-ai-foundation-contract.mjs',
  "assert.ok(index.includes('/api/family-ai/query'),'Family AI query route must remain registered');",
  "assert.ok(apiRoutes.includes('/api/family-ai/query'),'Family AI query route must remain registered');");

console.log(`context API route dispatcher extraction applied (${routeLines.length} routes; responsibility contracts migrated)`);
