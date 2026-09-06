import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;

export type TaskEditHierarchyDecision={ok:true}|{ok:false;status:400|403;message:string};

const scopeOf=(row:Row)=>String(row.visibility_scope||'FAMILY')==='PRIVATE'?'PRIVATE':'FAMILY';
const parentIdOf=(row:Row)=>row.parent_task_id===null||row.parent_task_id===undefined?null:Number(row.parent_task_id);
const truthy=(value:unknown)=>value===true||['1','true','on','yes'].includes(String(value??'').toLowerCase());

/** Re-check persisted one-level hierarchy invariants before the edit handler mutates anything. */
export async function validateTaskEditRequestHierarchy(
  request:Request,
  ctx:AppContext,
  taskId:number,
):Promise<TaskEditHierarchyDecision>{
  if(request.method!=='POST')return {ok:true};
  const member=ctx.member;
  if(!member)return {ok:true}; // canonical page handler owns authentication response semantics.
  if(!Number.isInteger(taskId)||taskId<=0)return {ok:true};

  let body:Record<string,unknown>;
  try{body=await bodyJson(request.clone());}
  catch(error){
    if(error instanceof RequestBodyParseError)return {ok:true}; // canonical parser returns the authoritative malformed-body response.
    throw error;
  }

  const task=(await ctx.env.DB.prepare(`SELECT t.id,t.created_by,t.parent_task_id,t.visibility_scope,t.private_owner_id FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`)
    .bind(taskId,member.family_id,member.id).first()) as Row|null;
  if(!task)return {ok:true};
  const role=String(member.role||'').toUpperCase();
  if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===Number(member.id)))return {ok:true};

  const requestedEvent=truthy(body.is_event);
  const requestedPrivate=truthy(body.visibility_scope==='PRIVATE'||body.is_private);
  const requestedScope=requestedPrivate?'PRIVATE':'FAMILY';
  const currentScope=scopeOf(task);
  const parentId=parentIdOf(task);

  if(parentId!==null){
    if(!Number.isInteger(parentId)||parentId<=0)return {ok:false,status:400,message:'親タスクが不正です。'};
    if(requestedEvent)return {ok:false,status:400,message:'子タスクはイベントに変更できません。'};

    const parent=(await ctx.env.DB.prepare('SELECT id,visibility_scope,private_owner_id,parent_task_id FROM tasks WHERE id=? AND family_id=? LIMIT 1')
      .bind(parentId,member.family_id).first()) as Row|null;
    if(!parent||parent.parent_task_id!==null)return {ok:false,status:400,message:'親タスクの階層が不正です。'};
    const parentScope=scopeOf(parent);
    if(requestedScope!==parentScope)return {ok:false,status:400,message:'親タスクと子タスクの公開範囲は一致している必要があります。'};
    if(parentScope==='PRIVATE'){
      const parentOwner=Number(parent.private_owner_id||0),childOwner=Number(task.private_owner_id||0);
      if(parentOwner<=0||childOwner!==parentOwner||parentOwner!==Number(member.id))return {ok:false,status:403,message:'自分専用タスクの所有者が一致しません。'};
    }
    return {ok:true};
  }

  if(requestedScope!==currentScope){
    const childCount=(await ctx.env.DB.prepare('SELECT COUNT(*) c FROM tasks WHERE family_id=? AND parent_task_id=?').bind(member.family_id,taskId).first()) as Row|null;
    if(Number(childCount?.c||0)>0)return {ok:false,status:400,message:'子タスクがあるため、公開範囲は変更できません。'};
  }
  return {ok:true};
}
