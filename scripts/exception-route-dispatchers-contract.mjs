import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const routes=fs.readFileSync('src/exception-routes.ts','utf8');

for(const marker of [
  "import { dispatchEarlyAuthenticatedRoute, dispatchContextPreludeRoute, dispatchContextFallbackRoute } from './exception-routes';",
  'const earlyAuthenticatedResponse=await dispatchEarlyAuthenticatedRoute(request,env,ctx,url);',
  'const preludeResponse=await dispatchContextPreludeRoute(request,context,env,url);',
  'const fallbackResponse=await dispatchContextFallbackRoute(request,context,env,url);',
]) if(!index.includes(marker)) throw new Error(`index dispatcher wiring missing: ${marker}`);

const preludePos=index.indexOf('const preludeResponse=');
const apiPos=index.indexOf('const apiResponse=');
const pagePos=index.indexOf('const pageResponse=');
const fallbackPos=index.indexOf('const fallbackResponse=');
if(!(preludePos>=0&&preludePos<apiPos&&apiPos<pagePos&&pagePos<fallbackPos)) throw new Error('exception dispatcher ordering changed');

for(const marker of [
  "if(url.pathname!=='/app/recurring.php') return null;",
  "if(url.pathname==='/oauth/google/authorize')",
  "if(url.pathname==='/oauth/google-tasks/authorize')",
  "if(url.pathname==='/oauth/google-calendar/authorize')",
  "if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login')",
  "if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose')",
  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check')",
  "if(url.pathname==='/logout.php'||url.pathname==='/logout')",
  "if(url.pathname==='/task/new.php')",
  "if(url.pathname==='/item/new.php')",
]) {
  if(index.includes(marker)) throw new Error(`exception route leaked into index: ${marker}`);
  if(!routes.includes(marker)) throw new Error(`exception route missing from dispatcher: ${marker}`);
}
for(const marker of [
  'export async function dispatchEarlyAuthenticatedRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{',
  "import { makeContext } from './app-context';",
  "event:'recurring_route_post'",
  'return await recurring(request,context);',
  "if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder')",
  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php')",
  "if(url.pathname==='/task/delete.php')",
  "if(url.pathname==='/task/convert_occurrence.php')",
  "console.log(JSON.stringify({stage:'AUTHORIZE_RECEIVED',provider:'GOOGLE_HOME'}));",
  "'Set-Cookie':'family_line_cf=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'",
  'preserveGoogleHomeLogin(request,env,await googleAuthorize(request,context))',
]) if(!routes.includes(marker)) throw new Error(`exception route behavior marker missing: ${marker}`);
if(/import\s*\{[^}]*makeContext[^}]*\}\s*from\s*['"]\.\/app['"]/.test(routes)) throw new Error('exception routes must not import makeContext from app.ts');

console.log('exception route dispatchers contract ok');
