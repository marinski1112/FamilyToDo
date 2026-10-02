import type { AppContext } from './app-context';
import { checklistCompletionSql } from './checklist-completion';
import { goodsVisibilitySql } from './goods-visibility';
import { recurringForRange } from './recurrence-projection';
import { json } from './response';
import { commitSession } from './session';
import { taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;
const LIMIT=500;
const headers={'cache-control':'private, no-store'};
const day=(d:Date)=>d.toISOString().slice(0,10);

/** Bounded, family-scoped snapshot for native Calendar and Goods tabs. */
export async function androidOverviewApi(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
  const member=ctx.member;
  if(!member)return json({ok:false,code:'AUTH_REQUIRED'},401,headers);
  const raw=new URL(request.url).searchParams.get('month')||'';
  if(!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(raw))return json({ok:false,code:'INVALID_MONTH'},400,headers);
  const [year,month]=raw.split('-').map(Number);
  const first=new Date(Date.UTC(year,month-1,1));
  const start=new Date(first);start.setUTCDate(1-first.getUTCDay());
  const end=new Date(Date.UTC(year,month,0));end.setUTCDate(end.getUTCDate()+(6-end.getUTCDay()));
  const from=day(start),to=day(end),fid=Number(member.family_id),mid=Number(member.id);
  if(!Number.isSafeInteger(fid)||fid<=0||!Number.isSafeInteger(mid)||mid<=0)return json({ok:false,code:'FORBIDDEN'},403,headers);

  const [taskResult,shoppingResult,itemResult,memberResult]=await Promise.all([
    ctx.env.DB.prepare(`SELECT t.id,t.title,t.task_kind,t.status,t.start_at,t.end_at,t.due_at,t.all_day,t.calendar_color,
      t.description,t.location,t.reminder_at,t.calendar_visible,t.visibility_scope,t.sort_order,t.parent_task_id
      FROM tasks t WHERE t.family_id=? AND ${taskVisibilitySql('t')}
      AND (upper(coalesce(t.task_kind,'TASK'))<>'EVENT' OR t.calendar_visible=1)
      AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template'))
      AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
        OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at) BETWEEN date(?) AND date(?)))
      ORDER BY coalesce(t.start_at,t.due_at),t.id LIMIT ?`).bind(fid,mid,to,from,from,to,LIMIT+1).all<Row>(),
    ctx.env.DB.prepare(`SELECT s.id,s.name,s.quantity,s.category,s.status,s.due_date,s.memo,s.url,s.completed_at,s.updated_at,s.created_at FROM shopping_items s
      WHERE s.family_id=? AND ${goodsVisibilitySql('s')} AND (${checklistCompletionSql('s')} OR s.due_date BETWEEN ? AND ?)
      ORDER BY s.status,s.due_date,s.id LIMIT ?`).bind(fid,mid,from,to,LIMIT+1).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.id,i.name,i.category,i.status,i.due_at,i.memo,i.url,i.completed_at,i.updated_at,i.created_at FROM items i
      WHERE i.family_id=? AND ${goodsVisibilitySql('i')} AND (${checklistCompletionSql('i')} OR date(i.due_at) BETWEEN date(?) AND date(?))
      ORDER BY i.status,i.due_at,i.id LIMIT ?`).bind(fid,mid,from,to,LIMIT+1).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL ORDER BY id LIMIT 100').bind(fid).all<Row>(),
  ]);
  // IDs come only from this authenticated, bounded task result. JSON avoids a
  // variable-length bind list and reads no child names/details for Calendar.
  const roots=taskResult.results.slice(0,LIMIT).filter(t=>!Number(t.parent_task_id||0)&&String(t.task_kind||'').toUpperCase()!=='EVENT').map(t=>Number(t.id));
  const [recurrent,undatedResult]=await Promise.all([
    recurringForRange(ctx,from,to),
    ctx.env.DB.prepare(`SELECT c.id,c.parent_task_id FROM tasks c
      WHERE c.parent_task_id IN (SELECT value FROM json_each(?)) AND c.family_id=? AND ${taskVisibilitySql('c')} AND c.start_at IS NULL AND c.due_at IS NULL
        AND upper(coalesce(c.task_kind,'TASK'))<>'EVENT' ORDER BY c.parent_task_id,c.id LIMIT ?`)
      .bind(JSON.stringify(roots),fid,mid,LIMIT+1).all<Row>(),
  ]);
  const visibleRecurrent=recurrent.filter(t=>{
    if(String(t.task_kind||'').toUpperCase()==='EVENT'&&Number(t.calendar_visible??1)!==1)return false;
    const scope=String(t.visibility_scope||'FAMILY').toUpperCase();
    return scope==='FAMILY'||(scope==='PRIVATE'&&Number(t.private_owner_id)===mid);
  }).slice(0,LIMIT+1);
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  const result=json({ok:true,schemaVersion:1,month:raw,from,to,familyId:fid,memberId:mid,csrf:ctx.session.csrfToken,
    tasks:[...taskResult.results.slice(0,LIMIT),...visibleRecurrent.slice(0,LIMIT)].slice(0,LIMIT),
    undatedChildren:undatedResult.results.slice(0,LIMIT),
    shopping:shoppingResult.results.slice(0,LIMIT),items:itemResult.results.slice(0,LIMIT),
    members:memberResult.results,
    canManageStamps:['OWNER','ADMIN'].includes(String(member.role||'').toUpperCase()),
    truncated:undatedResult.results.length>LIMIT||taskResult.results.length>LIMIT||visibleRecurrent.length>LIMIT||
      taskResult.results.length+visibleRecurrent.length>LIMIT||shoppingResult.results.length>LIMIT||itemResult.results.length>LIMIT,
  },200,headers);
  return commitSession(result,ctx.session,ctx.env.APP_SECRET);
}
