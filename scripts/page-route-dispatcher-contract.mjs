import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const pages=fs.readFileSync('src/page-routes.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');

if(!index.includes("import { dispatchPageRoute } from './page-routes';")) throw new Error('index.ts must import page dispatcher');
if(!index.includes('const pageResponse=await dispatchPageRoute(request,context,env,url);')) throw new Error('index.ts must invoke page dispatcher');
if(!index.includes('if(pageResponse) return pageResponse;')) throw new Error('index.ts must return matched page response');
if(!pages.includes('export async function dispatchPageRoute(request:Request,context:any,env:any,url:URL):Promise<Response|null>{')) throw new Error('page dispatcher export missing');
if(pages.includes("from './app'")) throw new Error('page-routes.ts must not depend directly on the app.ts monolith');
const pageBoundaryImports=["from './auth-page-handlers'","from './task-page-handlers'","from './calendar-page-handler'","from './message-page-handlers'","from './shopping-page-handlers'","from './location-page'","from './family-log-page-handler'","from './settings-page-handlers'"];
for(const marker of pageBoundaryImports) if(!pages.includes(marker)) throw new Error(`page handler boundary missing: ${marker}`);
const transitionalBoundaryFiles={
  'src/task-page-handlers.ts':['today','tomorrow','taskEdit','itemEdit'],
  'src/calendar-page-handler.ts':['calendar'],
  'src/settings-page-handlers.ts':['settings','settingsContent','settingsDiagnostics','settingsMembers','settingsNotifications','recurring'],
};
for(const [file,exports] of Object.entries(transitionalBoundaryFiles)){
  const source=fs.readFileSync(file,'utf8');
  if(!source.includes("from './app';")) throw new Error(`temporary page boundary must forward to current app implementation: ${file}`);
  for(const name of exports) if(!source.includes(name)) throw new Error(`${file} lost page handler: ${name}`);
}
const taskBoundary=fs.readFileSync('src/task-page-handlers.ts','utf8');
if(!taskBoundary.includes("export { taskEvents } from './task-events-page';")) throw new Error('task retained checklist handler missing');
if(!taskBoundary.includes("export { taskView } from './task-view-page';")) throw new Error('task retained detail handler missing');
const authBoundary=fs.readFileSync('src/auth-page-handlers.ts','utf8');
if(authBoundary.includes("from './app'")) throw new Error('auth page boundary must not depend on app.ts');
for(const marker of ["export { loginPage } from './login-page';","export { createFamilyPage } from './family-onboarding-page';","export { invitePage } from './family-invite-page';","export { home } from './home-page';"]) if(!authBoundary.includes(marker)) throw new Error(`auth retained page handler missing: ${marker}`);
const messageBoundary=fs.readFileSync('src/message-page-handlers.ts','utf8');
if(messageBoundary.includes("from './app'")) throw new Error('message page boundary must not depend on app.ts');
if(!messageBoundary.includes("export { messages } from './messages-api';")) throw new Error('message page boundary must export retained messages handler');
if(!messageBoundary.includes("export { messageNew } from './message-new-page';")) throw new Error('message page boundary must export retained messageNew handler');
const shoppingBoundary=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
if(shoppingBoundary.includes("from './app'")) throw new Error('shopping page boundary must not depend on app.ts');
for(const marker of ["export { shopping } from './shopping-root';","export { shoppingNew } from './shopping-new-page';","export { shoppingEdit } from './shopping-edit-page';"]) if(!shoppingBoundary.includes(marker)) throw new Error(`shopping retained page handler missing: ${marker}`);
const familyLogBoundary=fs.readFileSync('src/family-log-page-handler.ts','utf8');
if(familyLogBoundary.includes("from './app'")) throw new Error('Family Log page boundary must not forward directly to app.ts');
if(!familyLogBoundary.includes("export { familyLogPage as familyLog } from './family-log-page';")) throw new Error('Family Log retained page handler missing');
const routeSentinels=[
  "url.pathname==='/login.php'||url.pathname==='/login'||url.pathname==='/login_error.php'","url.pathname==='/app/create.php'||url.pathname==='/app/create'","url.pathname==='/app/join.php'||url.pathname==='/app/join'","url.pathname==='/family/create.php'||url.pathname==='/family/create'","url.pathname==='/family/join.php'||url.pathname==='/family/join'","url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php'","url.pathname==='/today.php'","url.pathname==='/tomorrow.php'","url.pathname==='/app/tasks.php'","url.pathname==='/app/calendar.php'","url.pathname==='/app/messages.php'","url.pathname==='/app/location.php'","url.pathname==='/app/shopping.php'","url.pathname==='/app/family_log.php'||url.pathname==='/app/settings_family_log.php'","url.pathname==='/app/child_journal.php'","url.pathname==='/app/family_log_import.php'","url.pathname==='/app/calendar_import.php'","url.pathname==='/app/settings.php'","url.pathname==='/app/settings_google_tasks.php'","url.pathname==='/app/settings_google_home.php'","url.pathname==='/app/settings_integrations.php'","url.pathname==='/app/message_new.php'","url.pathname==='/app/shopping_new.php'","url.pathname==='/app/settings_content.php'","url.pathname==='/app/settings_diagnostics.php'","url.pathname==='/app/settings_members.php'","url.pathname==='/app/settings_notifications.php'","url.pathname==='/app/settings_recurring.php'","url.pathname==='/app/logs.php'","url.pathname==='/task/view.php'","url.pathname==='/task/edit.php'","url.pathname==='/item/edit.php'","url.pathname==='/app/shopping_edit.php'"
];
for(const sentinel of routeSentinels){if(!pages.includes(sentinel)) throw new Error(`page dispatcher route missing: ${sentinel}`);if(index.includes(sentinel)) throw new Error(`page route must not remain in index.ts: ${sentinel}`);}
if(!apiRoutes.includes("if(url.pathname==='/api/toggle') return await toggle(request,context);")) throw new Error('context API toggle routing changed');
for(const required of ["if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);","if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);"]) if(!exceptionRoutes.includes(required)) throw new Error(`exception routing boundary changed: ${required}`);
if(!exceptionRoutes.includes("if(url.pathname!=='/app/recurring.php') return null;")) throw new Error('early recurring routing boundary changed');
if(!index.includes('return await env.ASSETS.fetch(request);')) throw new Error('asset fallback moved unexpectedly');
if(!pages.includes('return null;')) throw new Error('unmatched page route must fall through');
console.log('page route dispatcher contract: ok');
