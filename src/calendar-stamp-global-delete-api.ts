import { cleanupFamilySharedStamp } from './calendar-stamp-global-cleanup';
import { authenticStampParticipant, stampDeletionTransport, verifiedStampDeletionState } from './calendar-stamp-deletion-transport';
import { familySharedStampRegistryConfigFromEnv } from './calendar-shared-stamp-registry';
import { bodyJson } from './request-body';

const ID=/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
function registry(env:Env) {
  const config=familySharedStampRegistryConfigFromEnv(env);
  if (!config) throw new Error('not configured');
  return stampDeletionTransport({...config,fetcher:config.fetchImpl});
}
function diagnostic(error:unknown):string{
  if(error instanceof Error)return `${error.name}: ${error.message}`.slice(0,160);
  return 'unknown';
}

export async function calendarStampDeletionInternal(request:Request,env:Env):Promise<Response> {
  if (!await authenticStampParticipant(request,env.SHARED_STAMPS_SERVICE_TOKEN)) return reply({error:'UNAUTHORIZED'},401);
  const url=new URL(request.url);
  const match=/^\/api\/internal\/shared-stamp-deletion\/([^/]+)\/(approval|cleanup)$/u.exec(url.pathname);
  if (!match || !ID.test(match[1]!) || url.search) return reply({error:'INVALID_REQUEST'},400);
  const sharedId=match[1]!;
  try {
    if (match[2]==='approval' && request.method==='GET') {
      const row=await env.DB.prepare(`SELECT 1 FROM calendar_stamp_delete_approvals a
        JOIN members m ON m.id=a.member_id AND m.family_id=a.family_id AND m.active=1 AND m.role IN ('OWNER','ADMIN')
        WHERE a.shared_id=? AND a.approval=? AND a.expires_at>unixepoch()`)
        .bind(sharedId,request.headers.get('x-stamp-deletion-approval')??'').first();
      return reply({sharedId,approved:Boolean(row)});
    }
    if (match[2]==='cleanup' && request.method==='POST') {
      if (!env.MEDIA) return reply({error:'STORAGE_UNAVAILABLE'},503);
      const result=await cleanupFamilySharedStamp({db:env.DB,bucket:env.MEDIA,sharedId,
        confirmRegistryDeletion:async id=>{
          const state=verifiedStampDeletionState(await registry(env)(`/v1/stamps/${id}/deletion`),id);
          return state.sharedId===id && (state.state==='pending'||state.state==='completed');
        }});
      return reply({sharedId,...result});
    }
    return reply({error:'METHOD_NOT_ALLOWED'},405);
  } catch { return reply({error:'STAMP_DELETE_RETRY_REQUIRED'},503); }
}

export async function calendarStampGlobalDeleteAdmin(request:Request,context:any):Promise<Response> {
  const familyId=Number(context.member?.family_id),memberId=Number(context.member?.id);
  if (!Number.isSafeInteger(familyId)||!Number.isSafeInteger(memberId)||familyId<1||memberId<1) return reply({error:'AUTH_REQUIRED'},401);
  const env:Env=context.env;
  const admin=await env.DB.prepare("SELECT 1 FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN')")
    .bind(memberId,familyId).first();
  if (!admin) return reply({error:'ADMIN_REQUIRED'},403);
  const url=new URL(request.url);
  try {
    const remote=registry(env);
    if (request.method==='GET') {
      const after=url.searchParams.get('after')??'';
      if (after && !ID.test(after)) return reply({error:'INVALID_REQUEST'},400);
      return reply(await remote(`/v1/stamps/deletion-catalog${after?`?after=${after}`:''}`));
    }
    if (request.method!=='POST' || url.search) return reply({error:'METHOD_NOT_ALLOWED'},405);
    const body=await bodyJson(request);
    const expected=String(context.session?.csrfToken??'');
    if (!expected || body.csrf!==expected) return reply({error:'CSRF_FAILED'},403);
    if (typeof body.sharedId!=='string'||!ID.test(body.sharedId)||body.confirm!=='permanent') return reply({error:'INVALID_REQUEST'},400);
    const approval=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO calendar_stamp_delete_approvals(shared_id,family_id,member_id,approval,expires_at)
      VALUES(?,?,?,?,unixepoch()+300) ON CONFLICT(shared_id) DO UPDATE SET family_id=excluded.family_id,
      member_id=excluded.member_id,approval=excluded.approval,expires_at=excluded.expires_at`)
      .bind(body.sharedId,familyId,memberId,approval).run();
    const state=verifiedStampDeletionState(await remote(`/v1/stamps/${body.sharedId}`,'DELETE',approval),body.sharedId);
    return reply(state,state.deleted===true?200:202);
  } catch(error) {
    console.error('calendar stamp global deletion failed',diagnostic(error));
    return reply({error:'STAMP_DELETE_RETRY_REQUIRED'},503);
  }
}
