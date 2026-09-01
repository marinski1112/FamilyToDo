import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/page-routes.ts';
const contractPath='scripts/page-route-dispatcher-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

let index=fs.readFileSync(indexPath,'utf8');
const sf=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const exportDefault=sf.statements.find(s=>ts.isExportAssignment(s));
if(!exportDefault||!ts.isObjectLiteralExpression(exportDefault.expression)) throw new Error('default Worker object not found');
const fetchMethod=exportDefault.expression.properties.find(p=>ts.isMethodDeclaration(p)&&p.name?.getText(sf)==='fetch');
if(!fetchMethod?.body) throw new Error('Worker fetch method not found');
const tryStmt=fetchMethod.body.statements.find(s=>ts.isTryStatement(s));
if(!tryStmt) throw new Error('fetch try block not found');

const routeSentinels=[
  "url.pathname==='/login.php'||url.pathname==='/login'||url.pathname==='/login_error.php'",
  "url.pathname==='/app/create.php'||url.pathname==='/app/create'",
  "url.pathname==='/app/join.php'||url.pathname==='/app/join'",
  "url.pathname==='/family/create.php'||url.pathname==='/family/create'",
  "url.pathname==='/family/join.php'||url.pathname==='/family/join'",
  "url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php'",
  "url.pathname==='/today.php'",
  "url.pathname==='/tomorrow.php'",
  "url.pathname==='/app/tasks.php'",
  "url.pathname==='/app/calendar.php'",
  "url.pathname==='/app/messages.php'",
  "url.pathname==='/app/shopping.php'",
  "url.pathname==='/app/family_log.php'||url.pathname==='/app/settings_family_log.php'",
  "url.pathname==='/app/child_journal.php'",
  "url.pathname==='/app/family_log_import.php'",
  "url.pathname==='/app/calendar_import.php'",
  "url.pathname==='/app/settings.php'",
  "url.pathname==='/app/settings_google_tasks.php'",
  "url.pathname==='/app/settings_google_home.php'",
  "url.pathname==='/app/settings_integrations.php'",
  "url.pathname==='/app/message_new.php'",
  "url.pathname==='/app/shopping_new.php'",
  "url.pathname==='/app/settings_content.php'",
  "url.pathname==='/app/settings_diagnostics.php'",
  "url.pathname==='/app/settings_members.php'",
  "url.pathname==='/app/settings_notifications.php'",
  "url.pathname==='/app/settings_recurring.php'",
  "url.pathname==='/app/logs.php'",
  "url.pathname==='/task/view.php'",
  "url.pathname==='/task/edit.php'",
  "url.pathname==='/item/edit.php'",
  "url.pathname==='/app/shopping_edit.php'",
];

const topLevelIfs=tryStmt.tryBlock.statements.filter(ts.isIfStatement);
const selected=routeSentinels.map(sentinel=>{
  const matches=topLevelIfs.filter(node=>node.getText(sf).includes(sentinel));
  if(matches.length!==1) throw new Error(`expected one page route for ${sentinel}, found ${matches.length}`);
  return matches[0];
});
const unique=new Set(selected.map(n=>n.getStart(sf)));
if(unique.size!==selected.length) throw new Error('page route selection is not unique');
selected.sort((a,b)=>a.getStart(sf)-b.getStart(sf));

for(const required of [
  "if(url.pathname==='/api/toggle') return await toggle(request,context);",
  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",
  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",
  "if(url.pathname==='/app/recurring.php')",
  'return await env.ASSETS.fetch(request);',
]) if(!index.includes(required)) throw new Error(`non-page routing sentinel missing: ${required}`);

const moduleHeader=`import type { AppContext } from './app';
import { loginPage, createFamilyPage, invitePage, home, today, tomorrow, taskEvents, calendar, messages, shopping, familyLog, childJournalPage, settings, messageNew, shoppingNew, settingsContent, settingsDiagnostics, settingsMembers, settingsNotifications, recurring, taskView, taskEdit, itemEdit, shoppingEdit } from './app';
import { familyLogImportPage } from './family-log-import';
import { googleTasksSettings } from './google-tasks';
import { googleHomeSettings } from './google-home';
import { integrationsSettings } from './google-calendar';
import { calendarImportPage } from './calendar-ics-import';
import { logsPage } from './activity-log-page';
import { DEFAULT_FAMILY_TIMEZONE, familyDate } from './timezone';

function asDateOffset(days:number,timeZone=DEFAULT_FAMILY_TIMEZONE){const base=familyDate(timeZone),d=new Date(\`${'${base}'}T12:00:00Z\`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export async function dispatchPageRoute(request:Request,context:AppContext,env:Env,url:URL):Promise<Response|null>{
`;
const moduleBody=selected.map(node=>`  ${node.getText(sf)}`).join('\n');
fs.writeFileSync(modulePath,`${moduleHeader}${moduleBody}\n  return null;\n}\n`);

const first=selected[0];
for(const node of [...selected].sort((a,b)=>b.getStart(sf)-a.getStart(sf))){
  if(node===first) continue;
  const start=node.getFullStart();
  const end=node.end;
  index=index.slice(0,start)+index.slice(end);
}
const firstStart=first.getStart(sf);
const firstEnd=first.end;
const call="const pageResponse=await dispatchPageRoute(request,context,env,url);\n      if(pageResponse) return pageResponse;";
index=index.slice(0,firstStart)+call+index.slice(firstEnd);

const importAnchor="import { convertOccurrence } from './recurring-occurrence';\n";
if(!index.includes(importAnchor)) throw new Error('recurring occurrence import anchor missing');
index=index.replace(importAnchor,importAnchor+"import { dispatchPageRoute } from './page-routes';\n");

for(const sentinel of routeSentinels){
  if(index.includes(sentinel)) throw new Error(`page route remained in index.ts: ${sentinel}`);
}
if(!index.includes('const pageResponse=await dispatchPageRoute(request,context,env,url);')) throw new Error('page dispatcher call missing');
index=index.replace(/\n+$/,'\n');
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const pages=fs.readFileSync('src/page-routes.ts','utf8');

if(!index.includes("import { dispatchPageRoute } from './page-routes';")) throw new Error('index.ts must import page dispatcher');
if(!index.includes('const pageResponse=await dispatchPageRoute(request,context,env,url);')) throw new Error('index.ts must invoke page dispatcher');
if(!index.includes('if(pageResponse) return pageResponse;')) throw new Error('index.ts must return matched page response');
if(!pages.includes('export async function dispatchPageRoute(request:Request,context:AppContext,env:Env,url:URL):Promise<Response|null>{')) throw new Error('page dispatcher export missing');
const routeSentinels=${JSON.stringify(routeSentinels,null,2)};
for(const sentinel of routeSentinels){
  if(!pages.includes(sentinel)) throw new Error(\`page dispatcher route missing: \${sentinel}\`);
  if(index.includes(sentinel)) throw new Error(\`page route must not remain in index.ts: \${sentinel}\`);
}
for(const required of [
  "if(url.pathname==='/api/toggle') return await toggle(request,context);",
  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",
  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",
  "if(url.pathname==='/app/recurring.php')",
  'return await env.ASSETS.fetch(request);',
]) if(!index.includes(required)) throw new Error(\`non-page routing moved unexpectedly: \${required}\`);
if(!pages.includes('return null;')) throw new Error('unmatched page route must fall through');
console.log('page route dispatcher contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['recurring-occurrence-modularity','node scripts/recurring-occurrence-modularity-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('regression manifest recurring occurrence anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['page-route-dispatcher','node scripts/page-route-dispatcher-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log(`page route dispatcher extraction applied (${selected.length} routes)`);
