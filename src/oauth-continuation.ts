import { makeContext, liffEntryPage, layout } from './app';
import { commitSession } from './session';
import { verifyLineIdToken } from './line';
import { html } from './response';
import { liffTargetKind, resolveLiffDestination } from './liff-target';
import { recordLineTokenExchange, safeLineTokenErrorCategory } from './line-oauth-diagnostics';

const CONTINUE_COOKIE='family_google_home_continue';
const TXN_COOKIE='family_line_google_home_txn';
const loginChannelId=(e:Env)=>String(e.LINE_LOGIN_CHANNEL_ID||e.LINE_CHANNEL_ID||'');
export const GOOGLE_HOME_CONTINUATION_SECONDS=600;
type ContinuePayload={path:string;exp:number};
type LineTxn={state:string;nonce:string;pkce_verifier:string;google_home_resume:string;expires_at:number};
const b64=(v:Uint8Array)=>{let s='';for(const n of v)s+=String.fromCharCode(n);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
const unb64=(v:string)=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(v.length/4)*4,'=')),c=>c.charCodeAt(0));
const safePath=(v:unknown)=>{const p=String(v??'');return p.length<=2048&&/^\/oauth\/google\/authorize(?:\?|$)/.test(p)&&/^\/(?!\/)[^\r\n\\]*$/.test(p)?p:null;};
const key=async(s:string,purpose:string)=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${purpose}:${s}`)),'AES-GCM',false,['encrypt','decrypt']);
async function seal(value:unknown,secret:string,purpose:string){const iv=crypto.getRandomValues(new Uint8Array(12));const body=new TextEncoder().encode(JSON.stringify(value));return `${b64(iv)}.${b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret,purpose),body)))}`;}
async function open<T>(token:string,secret:string,purpose:string):Promise<T|null>{try{const[a,b]=String(token||'').split('.',2);if(!a||!b)return null;const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(a)},await key(secret,purpose),unb64(b));return JSON.parse(new TextDecoder().decode(raw)) as T;}catch{return null;}}
export async function sealGoogleHomeContinuation(path:string,secret:string){const valid=safePath(path);if(!valid||!secret)throw new Error('Invalid OAuth continuation');return seal({path:valid,exp:Date.now()+600000} satisfies ContinuePayload,secret,'wave120-google-home');}
export async function openGoogleHomeContinuation(token:string,secret:string):Promise<string|null>{const p=await open<ContinuePayload>(token,secret,'wave120-google-home');return p&&p.exp>=Date.now()?safePath(p.path):null;}
const cookie=(r:Request,name:string)=>{for(const part of (r.headers.get('cookie')||'').split(';')){const[k,...v]=part.trim().split('=');if(k===name)return v.join('=');}return '';};
const setCookie=(name:string,value:string,age=600)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const go=(r:Request,p:string,values:string[]=[] )=>{const h=new Headers({Location:new URL(p,r.url).toString(),'Cache-Control':'no-store'});for(const v of values)h.append('Set-Cookie',v);return new Response(null,{status:302,headers:h});};
const errorPage=(code:string,message:string)=>{const r=html(layout('Google Home 連携',`<div class="card"><h1>Google Home連携を続行できません</h1><p>${message}</p><p class="meta">${code}</p><p>通常のLINEアプリからFamily TODOへ登録後、Google Homeアプリで再度連携してください。</p></div>`),400);r.headers.append('Set-Cookie',setCookie(TXN_COOKIE,'',0));return r;};
const redirectUri=(e:Env)=>String(e.LINE_LOGIN_GOOGLE_HOME_REDIRECT_URI||'https://familytodo.marinski1112.workers.dev/oauth/line/google-home/callback');
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const equal=(a:string,b:string)=>{const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let d=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)d|=(x[i%x.length]||0)^(y[i%y.length]||0);return d===0;};

export async function preserveGoogleHomeLogin(r:Request,e:Env,response:Response){
  if(response.status!==302)return response;
  const login=new URL(response.headers.get('location')||'/login.php',r.url),path=safePath(login.searchParams.get('next'));
  if(login.pathname!=='/login.php'||!path)return response;
  const token=await sealGoogleHomeContinuation(path,e.APP_SECRET);
  console.log(JSON.stringify({stage:'GOOGLE_HOME_CONTINUATION_STORED',provider:'GOOGLE_HOME'}));
  return go(r,`/oauth/line/google-home/start?resume=${encodeURIComponent(token)}`,[setCookie(CONTINUE_COOKIE,token)]);
}
export async function lineGoogleHomeStart(r:Request,e:Env){
  const resume=new URL(r.url).searchParams.get('resume')||'';
  if(!await openGoogleHomeContinuation(resume,e.APP_SECRET))return errorPage('INVALID_CONTINUATION','Google Home連携情報が無効か、有効期限が切れました。');
  const clientId=loginChannelId(e);
  if(!clientId||!e.LINE_LOGIN_CHANNEL_SECRET)return errorPage('LINE_LOGIN_NOT_CONFIGURED','LINE Login設定が不足しています。');
  const state=random(),nonce=random(),verifier=random(),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),challenge=b64(digest);
  const txn=await seal({state,nonce,pkce_verifier:verifier,google_home_resume:resume,expires_at:Date.now()+600000} satisfies LineTxn,e.APP_SECRET,'wave120-line-google-home');
  const auth=new URL('https://access.line.me/oauth2/v2.1/authorize');
  for(const[k,v]of Object.entries({response_type:'code',client_id:clientId,redirect_uri:redirectUri(e),state,scope:'openid profile',nonce,code_challenge:challenge,code_challenge_method:'S256'}))auth.searchParams.set(k,v);
  console.log(JSON.stringify({stage:'LINE_WEB_AUTH_STARTED',provider:'LINE'}));
  return go(r,auth.toString(),[setCookie(TXN_COOKIE,txn)]);
}
export async function lineGoogleHomeCallback(r:Request,e:Env){
  console.log(JSON.stringify({stage:'LINE_WEB_AUTH_CALLBACK',provider:'LINE'}));
  const u=new URL(r.url),code=u.searchParams.get('code')||'',state=u.searchParams.get('state')||'';
  const txn=await open<LineTxn>(cookie(r,TXN_COOKIE),e.APP_SECRET,'wave120-line-google-home');
  if(!txn||txn.expires_at<Date.now())return errorPage('LINE_TXN_EXPIRED','LINEログインの有効期限が切れました。');
  if(!code||!state||!equal(state,txn.state))return errorPage('LINE_STATE_MISMATCH','LINEログインの検証情報が一致しません。');
  const clientId=loginChannelId(e);
  if(!clientId||!e.LINE_LOGIN_CHANNEL_SECRET)return errorPage('LINE_LOGIN_NOT_CONFIGURED','LINE Login設定が不足しています。');
  const tokenResponse=await fetch('https://api.line.me/oauth2/v2.1/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri(e),client_id:clientId,client_secret:e.LINE_LOGIN_CHANNEL_SECRET,code_verifier:txn.pkce_verifier})});
  const tokens=await tokenResponse.json().catch(()=>null) as {id_token?:string;error?:string}|null;
  if(!tokenResponse.ok||!tokens?.id_token){const category=safeLineTokenErrorCategory(tokens?.error);recordLineTokenExchange(category);console.warn(JSON.stringify({stage:'LINE_TOKEN_EXCHANGE_FAILED',provider:'LINE',http_status:tokenResponse.status,error_category:category}));return errorPage('LINE_TOKEN_EXCHANGE_FAILED','LINEログインを完了できませんでした。');}
  recordLineTokenExchange('success');console.log(JSON.stringify({stage:'LINE_TOKEN_EXCHANGE_SUCCESS',provider:'LINE',http_status:tokenResponse.status,error_category:'success'}));
  const verified=await verifyLineIdToken(tokens.id_token,clientId,txn.nonce).catch(()=>null);
  if(!verified)return errorPage('LINE_ID_TOKEN_INVALID','LINE本人確認に失敗しました。');
  console.log(JSON.stringify({stage:'LINE_WEB_AUTH_VERIFIED',provider:'LINE'}));
  const member=await e.DB.prepare('SELECT id,family_id,name FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(verified.sub).first<{id:number;family_id:number;name:string}>();
  if(!member)return errorPage('LINE_MEMBER_NOT_FOUND','このLINEアカウントはFamily TODOメンバーとして登録されていません。');
  const session={iat:Date.now(),lineUserId:verified.sub,lineDisplayName:verified.name||member.name,memberId:Number(member.id),familyId:Number(member.family_id),csrfToken:crypto.randomUUID()};
  const response=go(r,`/oauth/google/continue?resume=${encodeURIComponent(txn.google_home_resume)}`,[setCookie(TXN_COOKIE,'',0)]);
  console.log(JSON.stringify({stage:'LINE_WEB_SESSION_COMMITTED',provider:'LINE',member_present:true}));
  return commitSession(response,session,e.APP_SECRET);
}
export async function normalLiff(r:Request,e:Env){const u=new URL(r.url),next=resolveLiffDestination(u),ctx=await makeContext(r,e);console.log(JSON.stringify({stage:'LIFF_PRIMARY_RECEIVED',provider:'LINE',has_liff_state:u.searchParams.has('liff.state'),member_present:Boolean(ctx.member)}));console.log(JSON.stringify({stage:'LIFF_TARGET_RESOLVED',provider:'LINE',target_kind:liffTargetKind(next),has_liff_state:u.searchParams.has('liff.state'),member_present:Boolean(ctx.member)}));return liffEntryPage(e,{next,loginRedirect:u.pathname+u.search});}
export async function liffDispatcher(r:Request,e:Env){const u=new URL(r.url);if(u.searchParams.get('flow')==='google_home'||u.searchParams.has('resume')){const resume=u.searchParams.get('resume')||'';return await openGoogleHomeContinuation(resume,e.APP_SECRET)?go(r,`/oauth/line/google-home/start?resume=${encodeURIComponent(resume)}`):errorPage('INVALID_LEGACY_CONTINUATION','古いGoogle Home連携情報が無効です。');}return normalLiff(r,e);}
export async function resumeGoogleHome(r:Request,e:Env){const token=new URL(r.url).searchParams.get('resume')||'',path=await openGoogleHomeContinuation(token,e.APP_SECRET);if(!path)return errorPage('INVALID_CONTINUATION','Google Home連携情報が無効か、有効期限が切れました。');const ctx=await makeContext(r,e);if(!ctx.member)return errorPage('SESSION_COMMIT_FAILED','LINE認証後のセッションを確認できませんでした。');console.log(JSON.stringify({stage:'GOOGLE_HOME_CONTINUATION_RESUMED',provider:'GOOGLE_HOME',member_present:true}));return go(r,path,[setCookie(CONTINUE_COOKIE,'',0)]);}
