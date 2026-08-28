import { makeContext, liffEntryPage, layout } from './app';
import { html } from './response';
import { googleContinuePath, validateLiffNext } from './liff-target';

const COOKIE='family_google_home_continue';
const ATTEMPT_COOKIE='family_google_home_attempt';
const MAX_ATTEMPTS=3;
export const GOOGLE_HOME_CONTINUATION_SECONDS=600;
type Payload={path:string;exp:number};
const b64=(v:Uint8Array)=>{let s='';for(const n of v)s+=String.fromCharCode(n);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
const unb64=(v:string)=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(v.length/4)*4,'=')),c=>c.charCodeAt(0));
const safePath=(v:unknown)=>{const p=String(v??'');return p.length<=2048&&/^\/oauth\/google\/authorize(?:\?|$)/.test(p)&&/^\/(?!\/)[^\r\n\\]*$/.test(p)?p:null;};
const key=async(s:string)=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`wave117-google-home:${s}`)),'AES-GCM',false,['encrypt','decrypt']);
export async function sealGoogleHomeContinuation(path:string,secret:string){const valid=safePath(path);if(!valid||!secret)throw new Error('Invalid OAuth continuation');const iv=crypto.getRandomValues(new Uint8Array(12)),body=new TextEncoder().encode(JSON.stringify({path:valid,exp:Date.now()+600000} satisfies Payload));return `${b64(iv)}.${b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),body)))}`;}
export async function openGoogleHomeContinuation(token:string,secret:string):Promise<string|null>{try{if(!secret)return null;const[a,b]=String(token||'').split('.',2);if(!a||!b)return null;const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(a)},await key(secret),unb64(b));const p=JSON.parse(new TextDecoder().decode(raw)) as Payload;return p.exp>=Date.now()?safePath(p.path):null;}catch{return null;}}
const cookies=(r:Request)=>Object.fromEntries((r.headers.get('cookie')||'').split(';').map(v=>v.trim().split('=')).filter(v=>v[0]).map(([k,...v])=>[k,v.join('=')]));
const setCookie=(name:string,value:string,age=600)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export const clearGoogleHomeCookies=()=>[setCookie(COOKIE,'',0),setCookie(ATTEMPT_COOKIE,'',0)];
const appendCookies=(response:Response,values:string[])=>{const out=new Response(response.body,response);for(const value of values)out.headers.append('Set-Cookie',value);return out;};
const go=(r:Request,p:string,cookiesToSet:string[]=[] )=>{const h=new Headers({'Location':new URL(p,r.url).toString(),'Cache-Control':'no-store'});for(const value of cookiesToSet)h.append('Set-Cookie',value);return new Response(null,{status:302,headers:h});};
const errorPage=(message:string,cookiesToClear=true)=>appendCookies(html(layout('Google Home 連携',`<div class="card"><h1>Google Home連携を続行できません</h1><p>${message}</p><p>Google Homeアプリからもう一度連携してください。</p></div>`),400),cookiesToClear?clearGoogleHomeCookies():[]);
const explicitToken=(r:Request)=>new URL(r.url).searchParams.get('resume')||'';

export async function preserveGoogleHomeLogin(r:Request,e:Env,response:Response){
  if(response.status!==302)return response;
  const here=new URL(r.url),login=new URL(response.headers.get('location')||'/login.php',r.url);
  if(login.origin!==here.origin||login.pathname!=='/login.php')return appendCookies(response,clearGoogleHomeCookies());
  const path=safePath(login.searchParams.get('next'));if(!path)return appendCookies(response,clearGoogleHomeCookies());
  const token=await sealGoogleHomeContinuation(path,e.APP_SECRET);
  console.log(JSON.stringify({stage:'CONTINUATION_STORED',provider:'GOOGLE_HOME'}));
  return go(r,`/liff?flow=google_home&resume=${encodeURIComponent(token)}`,[setCookie(COOKIE,token),setCookie(ATTEMPT_COOKIE,'0')]);
}

export async function normalLiff(r:Request,e:Env){
  const url=new URL(r.url),next=validateLiffNext(url.searchParams.get('next'))||'/app/index.php';
  console.log(JSON.stringify({stage:'LIFF_OPENED_NORMAL'}));console.log(JSON.stringify({stage:'LIFF_NEXT_RESOLVED'}));
  const ctx=await makeContext(r,e);if(ctx.member)return go(r,next);
  return liffEntryPage(e,{next,loginRedirect:`/liff?next=${encodeURIComponent(next)}`});
}

export async function googleHomeLiff(r:Request,e:Env){
  console.log(JSON.stringify({stage:'LIFF_OPENED_GOOGLE_HOME',provider:'GOOGLE_HOME'}));
  const token=explicitToken(r);if(!token)return errorPage('Google Home連携情報の有効期限が切れました。');
  const path=await openGoogleHomeContinuation(token,e.APP_SECRET);if(!path)return errorPage('Google Home連携情報が無効か、有効期限が切れました。');
  const next=googleContinuePath(token);if(!next)return errorPage('Google Home連携情報が無効です。');
  const ctx=await makeContext(r,e);if(ctx.member)return go(r,next);
  const old=Number(cookies(r)[ATTEMPT_COOKIE]||0),attempt=Number.isInteger(old)?old+1:1;
  if(attempt>MAX_ATTEMPTS)return errorPage('LINEログインを繰り返したため、安全のため処理を停止しました。');
  return appendCookies(liffEntryPage(e,{next,loginRedirect:`/liff?flow=google_home&resume=${encodeURIComponent(token)}`}),[setCookie(ATTEMPT_COOKIE,String(attempt))]);
}

export async function liffDispatcher(r:Request,e:Env){
  const url=new URL(r.url);
  // A stale continuation cookie is deliberately irrelevant: only an explicit URL marker dispatches OAuth.
  if(url.searchParams.get('flow')==='google_home'||url.searchParams.has('resume'))return googleHomeLiff(r,e);
  return normalLiff(r,e);
}

export async function resumeGoogleHome(r:Request,e:Env){
  const token=explicitToken(r),path=token?await openGoogleHomeContinuation(token,e.APP_SECRET):null;
  if(!token||!path)return errorPage('Google Home連携情報が無効か、有効期限が切れました。');
  const ctx=await makeContext(r,e);
  if(!ctx.member)return go(r,`/liff?flow=google_home&resume=${encodeURIComponent(token)}`);
  console.log(JSON.stringify({stage:'LINE_LOGIN_COMPLETED',provider:'GOOGLE_HOME'}));
  console.log(JSON.stringify({stage:'CONTINUATION_RESUMED',provider:'GOOGLE_HOME',family_id:ctx.member.family_id,member_id:ctx.member.id}));
  return go(r,path,clearGoogleHomeCookies());
}
