import { recurring } from './recurring-page';
import { toggle } from './toggle-api';
import { makeContext } from './app-context';
import { liffLogin } from './liff-login';
import { redirect } from './response';
import { validateLiffNext } from './liff-target';
import { preserveGoogleHomeLogin } from './oauth-continuation';
import { googleAuthorize } from './google-home';
import { googleTasksAuthorize } from './google-tasks';
import { googleCalendarAuthorize } from './google-calendar';
import { liffConfigDiagnose } from './runtime-diagnostics';
import { reorderApi } from './reorder-api';
import { webhook } from './line-webhook';
import { taskDelete } from './task-delete';
import { convertOccurrence } from './recurring-occurrence';
import { taskNew, itemNew } from './new-entry-pages';
import { DEFAULT_FAMILY_TIMEZONE, familyDate } from './timezone';

function asDateOffset(days:number,timeZone=DEFAULT_FAMILY_TIMEZONE){const base=familyDate(timeZone),d=new Date(`${base}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

async function logout():Promise<Response>{
  const headers=new Headers({'Location':'/login.php','Set-Cookie':'family_line_cf=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  return new Response(null,{status:302,headers});
}

export async function dispatchEarlyAuthenticatedRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{
  if(url.pathname!=='/app/recurring.php') return null;
  // 認証が必要な recurring は通常 context flow より先に未ログインを処理し、
  // Cloudflare Runtime の例外化/Response 差異による 1101 を避ける。
  if(request.method==='POST') console.log(JSON.stringify({event:'recurring_route_post',path:url.pathname,method:request.method,content_type:request.headers.get('content-type')||'',accept:request.headers.get('accept')||'',ts:new Date().toISOString()}));
  const context=await makeContext(request,env,ctx);
  if(!context.member){const next=validateLiffNext(url.pathname+url.search);return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');}
  return await recurring(request,context);
}

export async function dispatchContextPreludeRoute(request:Request,context:any,env:Env,url:URL):Promise<Response|null>{
  if(url.pathname==='/oauth/google/authorize') {
    console.log(JSON.stringify({stage:'AUTHORIZE_RECEIVED',provider:'GOOGLE_HOME'}));
    return await preserveGoogleHomeLogin(request,env,await googleAuthorize(request,context));
  }
  if(url.pathname==='/oauth/google-tasks/authorize') return await googleTasksAuthorize(request,context);
  if(url.pathname==='/oauth/google-calendar/authorize') return await googleCalendarAuthorize(request,context);
  if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);
  return null;
}

export async function dispatchContextFallbackRoute(request:Request,context:any,env:Env,url:URL):Promise<Response|null>{
  if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return await liffConfigDiagnose(env);
  if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);
  if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);
  if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);
  if(url.pathname==='/logout.php'||url.pathname==='/logout') return await logout();
  if(url.pathname==='/task/delete.php') return await taskDelete(request,context);
  if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);
  if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');
  if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));
  return null;
}
