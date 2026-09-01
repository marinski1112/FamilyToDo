import { taskVisibilitySql } from './app';
import { json } from './response';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

export async function itemApi(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const name=String(b.name??'').trim(); const date=String(b.date??'').trim();
  if(!name)return json({ok:false,error:'持ち物名を入力してください。'},400);
  const taskId=Number(b.task_id??0)||null; let dueDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;
  let privateOwner=0;if(taskId){const t=await ctx.env.DB.prepare(`SELECT id,start_at,end_at,due_at,visibility_scope,private_owner_id FROM tasks t WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first();if(!t)return json({ok:false,error:'関連タスクが見つかりません。'},400);dueDate=String(t.start_at||t.due_at||'').slice(0,10)||dueDate;privateOwner=String(t.visibility_scope)==='PRIVATE'?Number(t.private_owner_id):0;}
  const now=nowJst();const r=await ctx.env.DB.prepare(`INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?)`).bind(m.family_id,name,String(b.memo??'').trim()||null,dueDate?`${dueDate} 00:00:00`:null,m.id,now,now,taskId).run();
  const id=Number(r.meta.last_row_id); const ids=privateOwner?[privateOwner]:Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[];
  if(ids.length) await ctx.env.DB.batch(ids.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
  if(!privateOwner)await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','item',id,JSON.stringify({name}),nowJst()).run().catch(()=>{});return json({ok:true,id,date:dueDate},201);
}
