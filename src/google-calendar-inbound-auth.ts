import { redirect } from './response';
import type { AppContext } from './app-context';
import { encryptRefreshToken } from './google-calendar-core';
import { utcNow } from './timezone';

type Row=Record<string,unknown>;
type InboundOAuthState={familyId:number;memberId:number;exp:number;nonce:string;purpose:'GOOGLE_CALENDAR_INBOUND_READ'};

const STATE_PREFIX='gcin1';
const STATE_PURPOSE='GOOGLE_CALENDAR_INBOUND_READ' as const;
const TOKEN_KEY_VERSION='v1';
export const GOOGLE_CALENDAR_INBOUND_SCOPES=[
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const;

const now=()=>utcNow();
const configured=(env:Env)=>Boolean(env.GOOGLE_CALENDAR_CLIENT_ID&&env.GOOGLE_CALENDAR_CLIENT_SECRET&&env.GOOGLE_CALENDAR_REDIRECT_URI&&env.GOOGLE_CALENDAR_TOKEN_KEY&&env.APP_SECRET);
const b64url=(value:string)=>btoa(value).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64url=(value:string)=>{const normalized=value.replaceAll('-','+').replaceAll('_','/');return atob(normalized+'='.repeat((4-normalized.length%4)%4));};
const b64urlBytes=(value:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');

async function signState(payload:string,secret:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64urlBytes(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${STATE_PREFIX}.${payload}`)));
}

async function createState(familyId:number,memberId:number,secret:string){
  const payload=b64url(JSON.stringify({familyId,memberId,exp:Date.now()+600000,nonce:crypto.randomUUID(),purpose:STATE_PURPOSE} satisfies InboundOAuthState));
  return `${STATE_PREFIX}.${payload}.${await signState(payload,secret)}`;
}

async function verifyState(value:string,secret:string):Promise<InboundOAuthState>{
  const [prefix,payload,signature,...extra]=value.split('.');
  if(prefix!==STATE_PREFIX||!payload||!signature||extra.length||signature!==await signState(payload,secret))throw new Error('invalid-state');
  let decoded:InboundOAuthState;
  try{decoded=JSON.parse(unb64url(payload)) as InboundOAuthState;}catch{throw new Error('invalid-state');}
  if(decoded.purpose!==STATE_PURPOSE||!Number.isSafeInteger(decoded.familyId)||!Number.isSafeInteger(decoded.memberId)||!decoded.nonce||!Number.isFinite(decoded.exp)||decoded.exp<Date.now())throw new Error('invalid-state');
  return decoded;
}

function grantedScopeSet(value:unknown){return new Set(String(value||'').split(/\s+/).map(x=>x.trim()).filter(Boolean));}
function hasRequiredScopes(value:unknown){const granted=grantedScopeSet(value);return GOOGLE_CALENDAR_INBOUND_SCOPES.every(scope=>granted.has(scope));}

export function isGoogleCalendarInboundOAuthState(value:unknown){return String(value||'').startsWith(`${STATE_PREFIX}.`);}

export async function googleCalendarInboundAuthorizationStatus(db:D1Database,familyId:number){
  const row=await db.prepare('SELECT status,granted_scopes,updated_at FROM google_calendar_inbound_authorizations WHERE family_id=? LIMIT 1').bind(familyId).first<Row>();
  const linked=String(row?.status||'')==='ACTIVE'&&hasRequiredScopes(row?.granted_scopes);
  return {linked,scopeReady:linked,status:String(row?.status||''),updatedAt:String(row?.updated_at||'')};
}

export async function googleCalendarInboundAuthorize(_request:Request,ctx:AppContext){
  if(!ctx.member)return redirect('/login.php');
  const role=String(ctx.member.role||'').toUpperCase();
  if(!['OWNER','ADMIN'].includes(role))return redirect('/app/settings_integrations.php?calendar=inbound-forbidden');
  if(!configured(ctx.env))return redirect('/app/settings_integrations.php?calendar=inbound-not-configured');
  const state=await createState(ctx.member.family_id,ctx.member.id,ctx.env.APP_SECRET);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',ctx.env.GOOGLE_CALENDAR_CLIENT_ID!);
  url.searchParams.set('redirect_uri',ctx.env.GOOGLE_CALENDAR_REDIRECT_URI!);
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope',GOOGLE_CALENDAR_INBOUND_SCOPES.join(' '));
  url.searchParams.set('access_type','offline');
  url.searchParams.set('prompt','consent');
  url.searchParams.set('include_granted_scopes','false');
  url.searchParams.set('state',state);
  return redirect(url.toString());
}

export async function googleCalendarInboundCallback(request:Request,env:Env){
  let category='inbound-auth-error';
  try{
    if(!configured(env))throw new Error('not-configured');
    const url=new URL(request.url);
    if(url.searchParams.get('error'))throw new Error('consent-denied');
    const state=await verifyState(url.searchParams.get('state')||'',env.APP_SECRET);
    const code=url.searchParams.get('code');
    if(!code)throw new Error('missing-code');
    const member=await env.DB.prepare('SELECT id,family_id,role,active,deleted_at FROM members WHERE id=? AND family_id=?').bind(state.memberId,state.familyId).first<Row>();
    if(!member||Number(member.active)!==1||member.deleted_at||!['OWNER','ADMIN'].includes(String(member.role||'').toUpperCase()))throw new Error('member-changed');
    const response=await fetch('https://oauth2.googleapis.com/token',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({code,client_id:env.GOOGLE_CALENDAR_CLIENT_ID!,client_secret:env.GOOGLE_CALENDAR_CLIENT_SECRET!,redirect_uri:env.GOOGLE_CALENDAR_REDIRECT_URI!,grant_type:'authorization_code'}),
    });
    if(!response.ok)throw new Error('token-exchange');
    const token=await response.json() as {refresh_token?:string;scope?:string};
    if(!token.refresh_token)throw new Error('missing-refresh-token');
    if(token.scope&&!hasRequiredScopes(token.scope))throw new Error('missing-read-scope');
    const grantedScopes=String(token.scope||GOOGLE_CALENDAR_INBOUND_SCOPES.join(' '));
    const cipher=await encryptRefreshToken(token.refresh_token,env.GOOGLE_CALENDAR_TOKEN_KEY!,TOKEN_KEY_VERSION);
    const timestamp=now();
    await env.DB.prepare(`INSERT INTO google_calendar_inbound_authorizations(family_id,member_id,refresh_token_ciphertext,token_key_version,granted_scopes,status,last_error,created_at,updated_at)
      VALUES(?,?,?,?,?,'ACTIVE',NULL,?,?)
      ON CONFLICT(family_id) DO UPDATE SET member_id=excluded.member_id,refresh_token_ciphertext=excluded.refresh_token_ciphertext,token_key_version=excluded.token_key_version,granted_scopes=excluded.granted_scopes,status='ACTIVE',last_error=NULL,updated_at=excluded.updated_at`)
      .bind(state.familyId,state.memberId,cipher,TOKEN_KEY_VERSION,grantedScopes,timestamp,timestamp).run();
    return redirect('/app/settings_integrations.php?calendar=inbound-authorized');
  }catch(error){
    const message=String(error instanceof Error?error.message:error);
    category=['not-configured','consent-denied','invalid-state','missing-code','member-changed','token-exchange','missing-refresh-token','missing-read-scope'].includes(message)?message:'inbound-auth-error';
    console.error('google calendar inbound callback failed:',category);
    return redirect('/app/settings_integrations.php?calendar=inbound-error&reason='+encodeURIComponent(category));
  }
}
