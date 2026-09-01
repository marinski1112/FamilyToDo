import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const pages=fs.readFileSync('src/page-routes.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');

if(!index.includes("import { dispatchPageRoute } from './page-routes';")) throw new Error('index.ts must import page dispatcher');
if(!index.includes('const pageResponse=await dispatchPageRoute(request,context,env,url);')) throw new Error('index.ts must invoke page dispatcher');
if(!index.includes('if(pageResponse) return pageResponse;')) throw new Error('index.ts must return matched page response');
if(!pages.includes('export async function dispatchPageRoute(request:Request,context:any,env:any,url:URL):Promise<Response|null>{')) throw new Error('page dispatcher export missing');
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
  "url.pathname==='/app/shopping_edit.php'"
];
for(const sentinel of routeSentinels){
  if(!pages.includes(sentinel)) throw new Error(`page dispatcher route missing: ${sentinel}`);
  if(index.includes(sentinel)) throw new Error(`page route must not remain in index.ts: ${sentinel}`);
}
if(!apiRoutes.includes("if(url.pathname==='/api/toggle') return await toggle(request,context);")) throw new Error('context API toggle routing changed');
for(const required of [
  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",
  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",
  "if(url.pathname==='/app/recurring.php')",
  'return await env.ASSETS.fetch(request);',
]) if(!index.includes(required)) throw new Error(`non-page routing moved unexpectedly: ${required}`);
if(!pages.includes('return null;')) throw new Error('unmatched page route must fall through');
console.log('page route dispatcher contract: ok');
