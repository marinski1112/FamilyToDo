import fs from 'node:fs';

const indexPath='src/index.ts';
const routesPath='src/exception-routes.ts';
const contractPath='scripts/index-entrypoint-final-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

const replaceOnce=(source,from,to,label)=>{
  const first=source.indexOf(from);
  if(first<0) throw new Error(`missing ${label}`);
  if(source.indexOf(from,first+from.length)>=0) throw new Error(`duplicate ${label}`);
  return source.slice(0,first)+to+source.slice(first+from.length);
};

let index=fs.readFileSync(indexPath,'utf8');
const exportPos=index.indexOf('export default {');
if(exportPos<0) throw new Error('Worker export missing');
const oldPrefix=index.slice(0,exportPos);
for(const marker of [
  "import { json, redirect, html } from './response';",
  "import { makeContext, liffEntryPage, authHealth, createFamily, joinFamily, today, tomorrow, taskEvents, calendar, messages, shopping, home, loginPage, createFamilyPage, apiMe, taskView, taskEdit, itemEdit, shoppingEdit, settings, settingsMembers, settingsNotifications, settingsContent, settingsDiagnostics, settingsDiagnosticsDetail, familyLog, recordOccurrenceFamilyLog, webPushApi, shoppingNew, messageNew, inviteCreate, invitePage, recurring, AuthRequired, BadRequest, Forbidden } from './app';",
  "const text = (r: Response) => r;",
  "const esc = (v: unknown)",
]) if(!oldPrefix.includes(marker)) throw new Error(`index prefix guard missing: ${marker}`);

const minimalPrefix=`import { json, redirect } from './response';\nimport { makeContext, AuthRequired, BadRequest, Forbidden } from './app';\nimport { processGoogleTasksInbound } from './google-tasks';\nimport { processCalendarOutbox, processCalendarInbound, renewCalendarWatches } from './google-calendar';\nimport { validateLiffNext } from './liff-target';\nimport { logRequestFailure } from './observability/errors';\nimport { processChildJournalCalendarOutbox } from './child-journal-calendar';\nimport { processNotifications } from './notification-delivery';\nimport { processLineDailyDigests } from './line-daily-digest';\nimport { dispatchPageRoute } from './page-routes';\nimport { dispatchContextApiRoute } from './context-api-routes';\nimport { dispatchPublicRoute } from './public-routes';\nimport { dispatchEarlyAuthenticatedRoute, dispatchContextPreludeRoute, dispatchContextFallbackRoute } from './exception-routes';\n\n`;
index=minimalPrefix+index.slice(exportPos);

const recurringBlock=`      // 認証が必要なページは、例外ベースのリダイレクトに依存せず\n      // ルーティング直下で未ログインを処理する。Cloudflare Runtimeでの\n      // 例外化/Response処理の差異による1101を避けるため。\n      if(url.pathname==='/app/recurring.php') {\n        if(request.method==='POST') console.log(JSON.stringify({event:'recurring_route_post',path:url.pathname,method:request.method,content_type:request.headers.get('content-type')||'',accept:request.headers.get('accept')||'',ts:new Date().toISOString()}));\n        const context=await makeContext(request,env,ctx);\n        if(!context.member){const next=validateLiffNext(url.pathname+url.search);return redirect(next?\`/login.php?next=\${encodeURIComponent(next)}\`:'/login.php');}\n        return await recurring(request,context);\n      }\n`;
const earlyCall=`      const earlyAuthenticatedResponse=await dispatchEarlyAuthenticatedRoute(request,env,ctx,url);\n      if(earlyAuthenticatedResponse) return earlyAuthenticatedResponse;\n`;
index=replaceOnce(index,recurringBlock,earlyCall,'early recurring route');
fs.writeFileSync(indexPath,index);

let routes=fs.readFileSync(routesPath,'utf8');
routes=replaceOnce(routes,"import { liffLogin, toggle } from './app';","import { makeContext, recurring, liffLogin, toggle } from './app';\nimport { redirect } from './response';\nimport { validateLiffNext } from './liff-target';",'exception route imports');
const earlyHandler=`export async function dispatchEarlyAuthenticatedRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{\n  if(url.pathname!=='/app/recurring.php') return null;\n  // 認証が必要な recurring は通常 context flow より先に未ログインを処理し、\n  // Cloudflare Runtime の例外化/Response 差異による 1101 を避ける。\n  if(request.method==='POST') console.log(JSON.stringify({event:'recurring_route_post',path:url.pathname,method:request.method,content_type:request.headers.get('content-type')||'',accept:request.headers.get('accept')||'',ts:new Date().toISOString()}));\n  const context=await makeContext(request,env,ctx);\n  if(!context.member){const next=validateLiffNext(url.pathname+url.search);return redirect(next?\`/login.php?next=\${encodeURIComponent(next)}\`:'/login.php');}\n  return await recurring(request,context);\n}\n\n`;
routes=replaceOnce(routes,'export async function dispatchContextPreludeRoute',earlyHandler+'export async function dispatchContextPreludeRoute','early handler anchor');
fs.writeFileSync(routesPath,routes);

const contract=`import fs from 'node:fs';\n\nconst index=fs.readFileSync('src/index.ts','utf8');\nconst routes=fs.readFileSync('src/exception-routes.ts','utf8');\n\nfor(const marker of [\n  "import { dispatchEarlyAuthenticatedRoute, dispatchContextPreludeRoute, dispatchContextFallbackRoute } from './exception-routes';",\n  'const earlyAuthenticatedResponse=await dispatchEarlyAuthenticatedRoute(request,env,ctx,url);',\n  'if(earlyAuthenticatedResponse) return earlyAuthenticatedResponse;',\n]) if(!index.includes(marker)) throw new Error(\`final entrypoint wiring missing: \${marker}\`);\nif(index.includes("if(url.pathname==='/app/recurring.php')")) throw new Error('recurring route must not remain inline in index');\nif(index.includes('const text =')||index.includes('const esc =')) throw new Error('unused entrypoint helpers must be removed');\nfor(const forbidden of ['liffEntryPage','googleFulfillment','calendarWatchWebhook','logsPage','itemApi','taskApi','dbSchemaHealth','archiveTaskCompletionStatements']){\n  if(index.includes(forbidden)) throw new Error(\`stale entrypoint dependency remains: \${forbidden}\`);\n}\nfor(const marker of [\n  'export async function dispatchEarlyAuthenticatedRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{',\n  "if(url.pathname!=='/app/recurring.php') return null;",\n  "event:'recurring_route_post'",\n  'const context=await makeContext(request,env,ctx);',\n  "validateLiffNext(url.pathname+url.search)",\n  "redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php')",\n  'return await recurring(request,context);',\n]) if(!routes.includes(marker)) throw new Error(\`early recurring behavior marker missing: \${marker}\`);\nconst publicPos=index.indexOf('const publicResponse=');\nconst earlyPos=index.indexOf('const earlyAuthenticatedResponse=');\nconst contextPos=index.indexOf('const context=await makeContext');\nconst preludePos=index.indexOf('const preludeResponse=');\nif(!(publicPos>=0&&publicPos<earlyPos&&earlyPos<contextPos&&contextPos<preludePos)) throw new Error('entrypoint dispatcher order changed');\nconsole.log('final index entrypoint contract ok');\n`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
manifest=replaceOnce(manifest,"      ['exception-route-dispatchers','node scripts/exception-route-dispatchers-contract.mjs'],","      ['exception-route-dispatchers','node scripts/exception-route-dispatchers-contract.mjs'],\n      ['index-entrypoint-final','node scripts/index-entrypoint-final-contract.mjs'],",'manifest final contract anchor');
fs.writeFileSync(manifestPath,manifest);

const modularityPath='scripts/index-entrypoint-modularity-contract.mjs';
let modularity=fs.readFileSync(modularityPath,'utf8');
modularity=replaceOnce(modularity,"const activityLogImport=\"import { logsPage } from './activity-log-page';\";\nif(!index.includes(activityLogImport)) throw new Error('index.ts must import activity log page module');","const activityLogImport=\"import { logsPage } from './activity-log-page';\";\nif(!pageRoutes.includes(activityLogImport)) throw new Error('page dispatcher must import activity log page module');",'activity log import responsibility');
fs.writeFileSync(modularityPath,modularity);

console.log('final index entrypoint cleanup applied');
