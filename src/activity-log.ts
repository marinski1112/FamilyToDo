import type { AppContext } from './app-context';

type Row = Record<string, unknown>;

export type ActivityLogFailureHandler=(error:unknown)=>void;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');

/**
 * Canonical retained activity-log writer.
 * Activity history is family-shared, so private task data and private task children
 * must never be projected into it. Logging failures are non-authoritative and are
 * silent by default; callers that need diagnostics may provide a bounded callback.
 */
export async function logActivity(
  ctx:AppContext,
  action:string,
  targetType:string,
  targetId:number|null,
  metadata:Row={},
  onFailure?:ActivityLogFailureHandler,
):Promise<void>{
  if(!ctx.member)return;
  try{
    if(targetId&&targetType==='task'){
      const task=await ctx.env.DB.prepare('SELECT visibility_scope FROM tasks WHERE id=? AND family_id=?')
        .bind(targetId,ctx.member.family_id).first<Row>();
      if(String(task?.visibility_scope)==='PRIVATE')return;
    }
    if(targetId&&(targetType==='item'||targetType==='shopping')){
      const table=targetType==='item'?'items':'shopping_items';
      const child=await ctx.env.DB.prepare(`SELECT t.visibility_scope FROM ${table} c JOIN tasks t ON t.id=c.task_id AND t.family_id=c.family_id WHERE c.id=? AND c.family_id=?`)
        .bind(targetId,ctx.member.family_id).first<Row>();
      if(String(child?.visibility_scope)==='PRIVATE')return;
    }
    await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)')
      .bind(ctx.member.family_id,ctx.member.id,action,targetType,targetId,JSON.stringify(metadata),nowJst()).run();
  }catch(error){
    onFailure?.(error);
  }
}
