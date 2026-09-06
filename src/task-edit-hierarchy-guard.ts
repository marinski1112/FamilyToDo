import type { AppContext } from './app-context';

type Row=Record<string,unknown>;

export type TaskEditHierarchyDecision={ok:true}|{ok:false;status:400|403;message:string};

const scopeOf=(row:Row)=>String(row.visibility_scope||'FAMILY')==='PRIVATE'?'PRIVATE':'FAMILY';
const parentIdOf=(row:Row)=>row.parent_task_id===null||row.parent_task_id===undefined?null:Number(row.parent_task_id);

/**
 * Re-check the persisted hierarchy at the mutation boundary. Browser state is advisory only:
 * concurrent child creation or a crafted edit request must never produce a child EVENT or
 * mismatched FAMILY/PRIVATE parent-child scopes.
 */
export async function validateTaskEditHierarchy(
  ctx:AppContext,
  task:Row,
  requested:{isEvent:boolean;makePrivate:boolean},
):Promise<TaskEditHierarchyDecision>{
  const member=ctx.member;
  if(!member)return {ok:false,status:403,message:'ログインが必要です。'};

  const requestedScope=requested.makePrivate?'PRIVATE':'FAMILY';
  const currentScope=scopeOf(task);
  const parentId=parentIdOf(task);

  if(parentId!==null){
    if(!Number.isInteger(parentId)||parentId<=0)return {ok:false,status:400,message:'親タスクが不正です。'};
    if(requested.isEvent)return {ok:false,status:400,message:'子タスクはイベントに変更できません。'};

    const parent=(await ctx.env.DB.prepare('SELECT id,visibility_scope,private_owner_id,parent_task_id FROM tasks WHERE id=? AND family_id=? LIMIT 1')
      .bind(parentId,member.family_id).first()) as Row|null;
    if(!parent||parent.parent_task_id!==null)return {ok:false,status:400,message:'親タスクの階層が不正です。'};

    const parentScope=scopeOf(parent);
    if(requestedScope!==parentScope)return {ok:false,status:400,message:'親タスクと子タスクの公開範囲は一致している必要があります。'};
    if(parentScope==='PRIVATE'){
      const parentOwner=Number(parent.private_owner_id||0);
      const childOwner=Number(task.private_owner_id||0);
      if(parentOwner<=0||childOwner!==parentOwner||parentOwner!==Number(member.id))return {ok:false,status:403,message:'自分専用タスクの所有者が一致しません。'};
    }
    return {ok:true};
  }

  if(requestedScope!==currentScope){
    const childCount=(await ctx.env.DB.prepare('SELECT COUNT(*) c FROM tasks WHERE family_id=? AND parent_task_id=?').bind(member.family_id,Number(task.id)).first()) as Row|null;
    if(Number(childCount?.c||0)>0)return {ok:false,status:400,message:'子タスクがあるため、公開範囲は変更できません。'};
  }
  return {ok:true};
}
