import fs from 'node:fs';

const indexPath='src/index.ts';
const modulePath='src/page-routes.ts';
const contractPath='scripts/page-route-dispatcher-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

let index=fs.readFileSync(indexPath,'utf8');
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

const selected=routeSentinels.map(sentinel=>{
  const count=index.split(sentinel).length-1;
  if(count!==1) throw new Error(`expected one page route sentinel for ${sentinel}, found ${count}`);
  const pos=index.indexOf(sentinel);
  const start=index.lastIndexOf('\n',pos)+1;
  const newline=index.indexOf('\n',pos);
  const end=newline===-1?index.length:newline+1;
  const text=index.slice(start,end).trim();
  if(!text.startsWith('if(')||!text.endsWith(';')) throw new Error(`page route must remain a one-line if statement: ${sentinel}`);
  return {start,end,text,sentinel};
}).sort((a,b)=>a.start-b.start);

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
const moduleBody=selected.map(route=>`  ${route.text}`).join('\n');
fs.writeFileSync(modulePath,`${moduleHeader}${moduleBody}\n  return null;\n}\n`);

const first=selected[0];
for(const route of [...selected].sort((a,b)=>b.start-a.start)){
  if(route===first) continue;
  index=index.slice(0,route.start)+index.slice(route.end);
}
const call="      const pageResponse=await dispatchPageRoute(request,context,env,url);\n      if(pageResponse) return pageResponse;\n";
index=index.slice(0,first.start)+call+index.slice(first.end);

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
