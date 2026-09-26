import type {AppContext} from './app-context';
import {bodyJson} from './request-body';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});

/** Family-admin recovery: expose row IDs and attempt counts, never private R2 object keys. */
export async function familyLogMediaCleanupAdmin(request:Request,context:AppContext):Promise<Response>{
  const member=context.member,role=String(member?.role||'').toUpperCase();
  if(!member||!['OWNER','ADMIN'].includes(role))return reply({ok:false,error:'ADMIN_REQUIRED'},403);
  const familyId=Number(member.family_id);
  if(request.method==='GET'){
    const rows=await context.env.DB.prepare("SELECT id,purpose,attempts,last_attempt_at FROM family_log_media_cleanup_queue WHERE family_id=? AND status='DEAD' ORDER BY id LIMIT 20")
      .bind(familyId).all<{id:number;purpose:string;attempts:number;last_attempt_at:string|null}>();
    return reply({ok:true,dead:rows.results});
  }
  if(request.method!=='POST')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const body=await bodyJson(request).catch(()=>null);
  if(!body||!context.session.csrfToken||body.csrf!==context.session.csrfToken)return reply({ok:false,error:'FORBIDDEN'},403);
  const id=Number(body.id);
  if(!Number.isSafeInteger(id)||id<=0)return reply({ok:false,error:'INVALID_ID'},400);
  const result=await context.env.DB.prepare("UPDATE family_log_media_cleanup_queue SET status='PENDING',attempts=0,last_attempt_at=NULL,next_attempt_at=NULL WHERE family_id=? AND id=? AND status='DEAD'")
    .bind(familyId,id).run();
  return Number(result.meta?.changes||0)===1?reply({ok:true}):reply({ok:false,error:'NOT_FOUND'},404);
}
