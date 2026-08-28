import { utcNow } from './timezone';

type Row=Record<string,unknown>;
// Wave125's INVALID_SERVICE_ACCOUNT_JSON/NOT_CONFIGURED buckets are intentionally
// superseded by the safe, actionable Wave126 categories below.
export type ServiceAccount={client_email:string;private_key:string;token_uri:string};
export type ServiceAccountCategory='MISSING_SECRET'|'JSON_SYNTAX_ERROR'|'JSON_WRAPPED_STRING_ACCEPTED'|'NOT_SERVICE_ACCOUNT'|'MISSING_CLIENT_EMAIL'|'MISSING_PRIVATE_KEY'|'INVALID_PRIVATE_KEY_PEM'|'PRIVATE_KEY_IMPORT_FAILED'|'VALID';
export type ServiceAccountParseResult={ok:true;credential:ServiceAccount;category:'VALID'|'JSON_WRAPPED_STRING_ACCEPTED'}|{ok:false;category:Exclude<ServiceAccountCategory,'VALID'|'JSON_WRAPPED_STRING_ACCEPTED'>};
export type RequestSyncStatus=Exclude<ServiceAccountCategory,'VALID'|'JSON_WRAPPED_STRING_ACCEPTED'>|'JWT_SIGN_FAILED'|'TOKEN_INVALID_GRANT'|'TOKEN_INVALID_CLIENT'|`TOKEN_HTTP_${number}`|'TOKEN_MISSING'|`HOMEGRAPH_HTTP_${number}`|'SUCCESS';

const SCOPE='https://www.googleapis.com/auth/homegraph';
const DEFAULT_TOKEN_URI='https://oauth2.googleapis.com/token';
const REQUEST_SYNC_URL='https://homegraph.googleapis.com/v1/devices:requestSync';
let cached:{token:string;expiresAt:number}|null=null;
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const encoded=(value:unknown)=>b64url(new TextEncoder().encode(JSON.stringify(value)));

function validTokenUri(value:unknown):string|null{
  if(value===undefined||value===null||value==='')return DEFAULT_TOKEN_URI;
  try{const url=new URL(String(value));return url.protocol==='https:'&&(url.hostname==='oauth2.googleapis.com'||url.hostname==='accounts.google.com'||url.hostname.endsWith('.googleapis.com'))?url.toString():null;}catch{return null;}
}

/** Parse exactly raw JSON or one accidentally JSON-stringified wrapper. Never decodes base64. */
export function parseGoogleHomeServiceAccountSecret(secret:unknown):ServiceAccountParseResult{
  const raw=String(secret??'').trim().replace(/^\uFEFF/,'').trim();
  if(!raw)return {ok:false,category:'MISSING_SECRET'};
  let value:unknown,wrapped=false;
  try{value=JSON.parse(raw);if(typeof value==='string'){wrapped=true;value=JSON.parse(value);}}catch{return {ok:false,category:'JSON_SYNTAX_ERROR'};}
  if(!value||typeof value!=='object'||Array.isArray(value)||String((value as Row).type||'')!=='service_account')return {ok:false,category:'NOT_SERVICE_ACCOUNT'};
  const row=value as Row,email=typeof row.client_email==='string'?row.client_email.trim():'';
  if(!email||email.length>320)return {ok:false,category:'MISSING_CLIENT_EMAIL'};
  let privateKey=typeof row.private_key==='string'?row.private_key:'';
  if(!privateKey.trim())return {ok:false,category:'MISSING_PRIVATE_KEY'};
  if(!privateKey.includes('\n')&&privateKey.includes('\\n'))privateKey=privateKey.replace(/\\n/g,'\n');
  if(!/^-----BEGIN PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END PRIVATE KEY-----\s*$/.test(privateKey))return {ok:false,category:'INVALID_PRIVATE_KEY_PEM'};
  const tokenUri=validTokenUri(row.token_uri);if(!tokenUri)return {ok:false,category:'NOT_SERVICE_ACCOUNT'};
  return {ok:true,credential:{client_email:email,private_key:privateKey,token_uri:tokenUri},category:wrapped?'JSON_WRAPPED_STRING_ACCEPTED':'VALID'};
}

function pemBytes(pem:string){return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0));}
async function importPrivateKey(credential:ServiceAccount){
  try{return await crypto.subtle.importKey('pkcs8',pemBytes(credential.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);}
  catch{throw new Error('PRIVATE_KEY_IMPORT_FAILED');}
}
export async function validateGoogleHomeServiceAccountSecret(secret:unknown){const parsed=parseGoogleHomeServiceAccountSecret(secret);if(!parsed.ok)return parsed;try{await importPrivateKey(parsed.credential);return parsed;}catch{return {ok:false,category:'PRIVATE_KEY_IMPORT_FAILED' as const};}}
export function googleHomeServiceAccountReadiness(env:Env){const parsed=parseGoogleHomeServiceAccountSecret(env.GOOGLE_HOME_SERVICE_ACCOUNT_JSON);return {present:Boolean(String(env.GOOGLE_HOME_SERVICE_ACCOUNT_JSON||'').trim()),valid:parsed.ok,category:parsed.category,wrapped:parsed.ok&&parsed.category==='JSON_WRAPPED_STRING_ACCEPTED'};}
export const googleHomeRequestSyncConfigured=(env:Env)=>parseGoogleHomeServiceAccountSecret(env.GOOGLE_HOME_SERVICE_ACCOUNT_JSON).ok;

export async function createHomeGraphJwt(env:Env,nowSeconds=Math.floor(Date.now()/1000)){
  const parsed=parseGoogleHomeServiceAccountSecret(env.GOOGLE_HOME_SERVICE_ACCOUNT_JSON);if(!parsed.ok)throw new Error(parsed.category);
  const service=parsed.credential,unsigned=`${encoded({alg:'RS256',typ:'JWT'})}.${encoded({iss:service.client_email,scope:SCOPE,aud:service.token_uri,iat:nowSeconds,exp:nowSeconds+3600})}`;
  const key=await importPrivateKey(service);let signature:ArrayBuffer;try{signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));}catch{throw new Error('JWT_SIGN_FAILED');}
  return `${unsigned}.${b64url(new Uint8Array(signature))}`;
}
async function accessToken(env:Env){
  if(cached&&cached.expiresAt>Date.now()+60_000)return cached.token;
  const parsed=parseGoogleHomeServiceAccountSecret(env.GOOGLE_HOME_SERVICE_ACCOUNT_JSON);if(!parsed.ok)throw new Error(parsed.category);const service=parsed.credential;
  const response=await fetch(service.token_uri,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:await createHomeGraphJwt(env)})});
  if(!response.ok){if(response.status===400){const body=await response.json().catch(()=>null) as {error?:unknown}|null;if(body?.error==='invalid_grant')throw new Error('TOKEN_INVALID_GRANT');if(body?.error==='invalid_client')throw new Error('TOKEN_INVALID_CLIENT');}throw new Error(`TOKEN_HTTP_${response.status}`);}
  const body=await response.json() as {access_token?:string;expires_in?:number};if(!body.access_token)throw new Error('TOKEN_MISSING');cached={token:body.access_token,expiresAt:Date.now()+Math.max(60,Number(body.expires_in||3600))*1000};return cached.token;
}
async function audit(env:Env,familyId:number,memberId:number,status:'SUCCESS'|'FAILED',detail?:string){await env.DB.prepare("INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,'GOOGLE_HOME_REQUEST_SYNC','google_home',NULL,?,?)").bind(familyId,memberId,JSON.stringify({provider:'GOOGLE_HOME',status,detail:detail?.slice(0,80)}),utcNow()).run().catch(()=>{});}
function safeStatus(error:unknown):RequestSyncStatus{const value=error instanceof Error?error.message:'';if(/^(?:TOKEN_HTTP_|HOMEGRAPH_HTTP_)\d+$/.test(value)||['MISSING_SECRET','JSON_SYNTAX_ERROR','NOT_SERVICE_ACCOUNT','MISSING_CLIENT_EMAIL','MISSING_PRIVATE_KEY','INVALID_PRIVATE_KEY_PEM','PRIVATE_KEY_IMPORT_FAILED','JWT_SIGN_FAILED','TOKEN_INVALID_GRANT','TOKEN_INVALID_CLIENT','TOKEN_MISSING'].includes(value))return value as RequestSyncStatus;return 'JWT_SIGN_FAILED';}
export async function requestGoogleHomeSync(env:Env,familyId:number,memberId:number){const local=await validateGoogleHomeServiceAccountSecret(env.GOOGLE_HOME_SERVICE_ACCOUNT_JSON);if(!local.ok)return {ok:false,status:local.category};try{const response=await fetch(REQUEST_SYNC_URL,{method:'POST',headers:{authorization:`Bearer ${await accessToken(env)}`,'content-type':'application/json'},body:JSON.stringify({agentUserId:`ft-member-${memberId}`,async:false})});if(!response.ok)throw new Error(`HOMEGRAPH_HTTP_${response.status}`);await audit(env,familyId,memberId,'SUCCESS','SUCCESS');return {ok:true,status:'SUCCESS' as const};}catch(error){const status=safeStatus(error);await audit(env,familyId,memberId,'FAILED',status);return {ok:false,status};}}
export async function requestGoogleHomeSyncForFamily(env:Env,familyId:number){const links=await env.DB.prepare('SELECT DISTINCT member_id FROM google_home_tokens WHERE family_id=? AND revoked_at IS NULL').bind(familyId).all<Row>();return Promise.all(links.results.map(row=>requestGoogleHomeSync(env,familyId,Number(row.member_id))));}
