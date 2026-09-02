import { json } from './response';
import { makeContext } from './app-context';
import { authHealth } from './auth-health';
import { dbSchemaHealth, dbRuntimeHealth } from './runtime-diagnostics';
import { googleHomeHealth, googleToken, googleFulfillment } from './google-home';
import { integrationsHealthResponse } from './environment-health';
import { googleCalendarCallback } from './google-calendar';
import { calendarWatchNotificationOnly } from './google-calendar-one-way';
import { googleTasksCallback } from './google-tasks';
import { liffDispatcher, lineGoogleHomeStart, lineGoogleHomeCallback, resumeGoogleHome } from './oauth-continuation';

export async function dispatchPublicRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{
  if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});
  if(url.pathname==='/__cf/secrets-health') return json({ok:true,service:'familytodo-secrets'});
  if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}
  if(url.pathname==='/__cf/db-schema-health') return await dbSchemaHealth(env);
  if(url.pathname==='/__cf/db-runtime-health') return await dbRuntimeHealth(env);
  if(url.pathname==='/__cf/auth-health'){const context=await makeContext(request,env,ctx);return await authHealth(context);}
  if(url.pathname==='/__cf/google-home-health') return await googleHomeHealth(env);
  if(url.pathname==='/__cf/integrations-health') return integrationsHealthResponse(env);
  if(url.pathname==='/api/google-calendar/watch') return await calendarWatchNotificationOnly(request,env);
  if(url.pathname==='/oauth/google/token') return await googleToken(request,env);
  if(url.pathname==='/oauth/google-tasks/callback') return await googleTasksCallback(request,env);
  if(url.pathname==='/oauth/google-calendar/callback') return await googleCalendarCallback(request,env);
  if(url.pathname==='/api/google-home/fulfillment') return await googleFulfillment(request,env);
  if(url.pathname==='/liff'||url.pathname.startsWith('/liff/')) return await liffDispatcher(request,env);
  if(url.pathname==='/oauth/line/google-home/start') return await lineGoogleHomeStart(request,env);
  if(url.pathname==='/oauth/line/google-home/callback') return await lineGoogleHomeCallback(request,env);
  if(url.pathname==='/oauth/google/continue') return await resumeGoogleHome(request,env);
  return null;
}
