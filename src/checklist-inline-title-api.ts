import { json } from './response';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';
import { queueCalendarProjectionAfterMutation, wakeCalendarOutbox } from './google-calendar';

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

type EditableType='task'|'shopping'|'item'|'recurrence';

export async function checklistInlineTitleApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;
  if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(body.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);

  const type=String(body.type||'') as EditableType;
  const id=Number(body.id||0);
  const title=String(body.title??'').trim();
  if(!['task','shopping','item','recurrence'].includes(type)||!Number.isInteger(id)||id<=0)return json({ok:false,error:'編集対象が不正です。'},400);
  if(!title)return json({ok:false,error:'文字を入力してください。'},400);
  if(title.length>200)return json({ok:false,error:'200文字以内で入力してください。'},400);

  const now=nowJst();
  let taskId:number|null=null;
  if(type==='task'){
    const row=await ctx.env.DB.prepare(`SELECT t.id FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(id,m.family_id,m.id).first();
    if(!row)return json({ok:false,error:'対象が見つかりません。'},404);
    await ctx.env.DB.prepare('UPDATE tasks SET title=?,updated_at=? WHERE id=? AND family_id=?').bind(title,now,id,m.family_id).run();
    taskId=id;
  }else if(type==='recurrence'){
    const row=await ctx.env.DB.prepare(`SELECT rr.task_id FROM recurrence_rules rr JOIN tasks t ON t.id=rr.task_id AND t.family_id=rr.family_id WHERE rr.id=? AND rr.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(id,m.family_id,m.id).first();
    if(!row)return json({ok:false,error:'対象が見つかりません。'},404);
    taskId=Number(row.task_id||0)||null;
    if(!taskId)return json({ok:false,error:'対象タスクが見つかりません。'},404);
    await ctx.env.DB.prepare('UPDATE tasks SET title=?,updated_at=? WHERE id=? AND family_id=?').bind(title,now,taskId,m.family_id).run();
  }else if(type==='shopping'){
    const row=await ctx.env.DB.prepare(`SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=? AND ${taskChildVisibilitySql('s')} LIMIT 1`).bind(id,m.family_id,m.id).first();
    if(!row)return json({ok:false,error:'対象が見つかりません。'},404);
    await ctx.env.DB.prepare('UPDATE shopping_items SET name=?,updated_at=? WHERE id=? AND family_id=?').bind(title,now,id,m.family_id).run();
  }else{
    const row=await ctx.env.DB.prepare(`SELECT i.id FROM items i WHERE i.id=? AND i.family_id=? AND ${taskChildVisibilitySql('i')} LIMIT 1`).bind(id,m.family_id,m.id).first();
    if(!row)return json({ok:false,error:'対象が見つかりません。'},404);
    await ctx.env.DB.prepare('UPDATE items SET name=?,updated_at=? WHERE id=? AND family_id=?').bind(title,now,id,m.family_id).run();
  }

  if(taskId){
    try{await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,taskId);wakeCalendarOutbox(ctx,m.family_id);}catch{/* local mutation remains authoritative */}
  }
  return json({ok:true,title});
}
