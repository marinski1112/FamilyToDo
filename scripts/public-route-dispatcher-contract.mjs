import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');
if(!index.includes("import { dispatchPublicRoute } from './public-routes';")) throw new Error('index.ts must import public dispatcher');
if(!index.includes('const publicResponse=await dispatchPublicRoute(request,env,ctx,url);')) throw new Error('index.ts must invoke public dispatcher before context routing');
if(!index.includes('if(publicResponse) return publicResponse;')) throw new Error('index.ts must return matched public response');
if(!publicRoutes.includes('export async function dispatchPublicRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{')) throw new Error('public dispatcher export missing');
const routeLines=[
  "if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});",
  "if(url.pathname==='/__cf/secrets-health') return json({ok:true,service:'familytodo-secrets'});",
  "if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}",
  "if(url.pathname==='/__cf/db-schema-health') return await dbSchemaHealth(env);",
  "if(url.pathname==='/__cf/db-runtime-health') return await dbRuntimeHealth(env);",
  "if(url.pathname==='/__cf/auth-health'){const context=await makeContext(request,env,ctx);return await authHealth(context);}",
  "if(url.pathname==='/__cf/google-home-health') return await googleHomeHealth(env);",
  "if(url.pathname==='/__cf/integrations-health') return integrationsHealthResponse(env);",
  "if(url.pathname==='/api/google-calendar/watch') return await calendarWatchNotificationOnly(request,env);",
  "if(url.pathname==='/oauth/google/token') return await googleToken(request,env);",
  "if(url.pathname==='/oauth/google-tasks/callback') return await googleTasksCallback(request,env);",
  "if(url.pathname==='/oauth/google-calendar/callback') return await googleCalendarCallback(request,env);",
  "if(url.pathname==='/api/google-home/fulfillment') return await googleFulfillment(request,env);",
  "if(url.pathname==='/liff'||url.pathname.startsWith('/liff/')) return await liffDispatcher(request,env);",
  "if(url.pathname==='/oauth/line/google-home/start') return await lineGoogleHomeStart(request,env);",
  "if(url.pathname==='/oauth/line/google-home/callback') return await lineGoogleHomeCallback(request,env);",
  "if(url.pathname==='/oauth/google/continue') return await resumeGoogleHome(request,env);"
];
for(const route of routeLines){
  if(!publicRoutes.includes(route)) throw new Error(`public dispatcher route missing: ${route}`);
  if(index.split('\n').some(line=>line.trim()===route)) throw new Error(`public route must not remain in index.ts: ${route}`);
}
for(const required of [
  "if(url.pathname==='/oauth/google/authorize') {",
  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",
]) if(!exceptionRoutes.includes(required)) throw new Error(`exception routing boundary changed: ${required}`);
if(!exceptionRoutes.includes("if(url.pathname!=='/app/recurring.php') return null;")) throw new Error('early recurring routing boundary changed');
for(const required of [
  'const context=await makeContext(request,env,ctx);',
  'const apiResponse=await dispatchContextApiRoute(request,context,url);',
  'const pageResponse=await dispatchPageRoute(request,context,env,url);',
  'return await env.ASSETS.fetch(request);',
]) if(!index.includes(required)) throw new Error(`non-public routing moved unexpectedly: ${required}`);
for(const privacy of [
  "json({ok:true,service:'familytodo-secrets'})",
  "integrationsHealthResponse(env)",
]) if(!publicRoutes.includes(privacy)) throw new Error(`public privacy sentinel missing: ${privacy}`);
if(!publicRoutes.includes('return null;')) throw new Error('unmatched public route must fall through');
console.log('public route dispatcher contract: ok');
