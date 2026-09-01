import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
if(!index.includes("import { dispatchContextApiRoute } from './context-api-routes';")) throw new Error('index.ts must import context API dispatcher');
if(!index.includes('const apiResponse=await dispatchContextApiRoute(request,context,url);')) throw new Error('index.ts must invoke context API dispatcher');
if(!index.includes('if(apiResponse) return apiResponse;')) throw new Error('index.ts must return matched context API response');
if(!apiRoutes.includes('export async function dispatchContextApiRoute(request:Request,context:any,url:URL):Promise<Response|null>{')) throw new Error('context API dispatcher export missing');
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
  "if(url.pathname==='/api/push/subscribe'||url.pathname==='/api/push/unsubscribe'||url.pathname==='/api/push/test') return await webPushApi(request,context);"
];
for(const route of routeLines){
  if(!apiRoutes.includes(route)) throw new Error(`context API dispatcher route missing: ${route}`);
  if(index.split('\n').some(line=>line.trim()===route)) throw new Error(`context API route must not remain in index.ts: ${route}`);
}
for(const required of [
  "if(url.pathname==='/api/google-calendar/watch') return await calendarWatchWebhook(request,env,ctx);",
  "if(url.pathname==='/api/google-home/fulfillment') return await googleFulfillment(request,env);",
  "if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);",
  'const pageResponse=await dispatchPageRoute(request,context,env,url);',
  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",
]) if(!index.includes(required)) throw new Error(`routing boundary moved unexpectedly: ${required}`);
if(!apiRoutes.includes('return null;')) throw new Error('unmatched context API route must fall through');
console.log('context API route dispatcher contract: ok');
