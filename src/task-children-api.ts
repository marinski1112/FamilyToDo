import { json } from './response';
import { taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;

export async function taskChildrenApi(request:Request,ctx:any):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method!=='GET')return json({ok:false,error:'GET only'},405);

  const parentId=Number(new URL(request.url).searchParams.get('parent_id')||0);
  if(!Number.isInteger(parentId)||parentId<=0)return json({ok:false,error:'親タスクが不正です。'},400);

  const parent=(await ctx.env.DB.prepare(`SELECT t.id,t.created_by,t.parent_task_id,t.visibility_scope,t.private_owner_id,t.task_kind FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`)
    .bind(parentId,member.family_id,member.id).first()) as Row|null;
  if(!parent)return json({ok:false,error:'親タスクが見つかりません。'},404);

  const role=String(member.role||'').toUpperCase();
  const canManageParent=role==='OWNER'||role==='ADMIN'||Number(parent.created_by)===Number(member.id);
  const children=(await ctx.env.DB.prepare(`SELECT t.id,t.title,t.status,t.completion_mode,t.created_by,t.start_at,t.due_at,t.calendar_visible,
      COALESCE((SELECT GROUP_CONCAT(am.id) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id),'') assignee_ids,
      COALESCE((SELECT GROUP_CONCAT(am.name,'、') FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=t.id),'') assignees
    FROM tasks t
    WHERE t.family_id=? AND t.parent_task_id=? AND ${taskVisibilitySql('t')}
    ORDER BY CASE WHEN t.status='completed' THEN 1 ELSE 0 END,COALESCE(t.start_at,t.due_at,'9999-12-31'),t.id`)
    .bind(member.family_id,parentId,member.id).all()) as {results:Row[]};

  return json({
    ok:true,
    parent:{
      id:parentId,
      visibilityScope:String(parent.visibility_scope)==='PRIVATE'?'PRIVATE':'FAMILY',
      privateOwnerId:parent.private_owner_id===null?null:Number(parent.private_owner_id),
      isChild:parent.parent_task_id!==null,
      kind:String(parent.task_kind||'TASK').toUpperCase()==='EVENT'?'EVENT':'TASK',
    },
    canAddChildren:canManageParent&&parent.parent_task_id===null,
    children:children.results.map((row:Row)=>{
      const start=String(row.start_at||row.due_at||'');
      const assigneeIds=String(row.assignee_ids||'').split(',').map(Number).filter(id=>Number.isInteger(id)&&id>0);
      return {
        id:Number(row.id),
        title:String(row.title||''),
        status:String(row.status||'pending'),
        completionMode:String(row.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY',
        dueDate:start.slice(0,10),
        dueTime:row.start_at?String(row.start_at).slice(11,16):'',
        calendarVisible:Boolean(Number(row.calendar_visible??0)),
        assigneeIds,
        assignees:String(row.assignees||''),
        canEdit:role==='OWNER'||role==='ADMIN'||Number(row.created_by)===Number(member.id),
      };
    }),
  });
}
