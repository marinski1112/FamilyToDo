import type { AppContext } from './app-context';
import { logActivity } from './activity-log';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';
import { updateRecurrenceOccurrenceAggregateCompat } from './recurrence-completion-state';
import { commitSession } from './session';
import { taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');

const badRequest=(message:string)=>json({ok:false,error:message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
const forbidden=(message:string)=>json({ok:false,error:message||'この操作は許可されていません。',code:'FORBIDDEN'},403);

/** Canonical completion toggle handler independent from the legacy app.ts monolith. */
export async function toggle(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);

  let b:Record<string,unknown>;
  try{b=await bodyJson(request);}
  catch(error){if(error instanceof RequestBodyParseError)return badRequest(error.message);throw error;}
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof b.csrf!=='string'||b.csrf!==ctx.session.csrfToken)return forbidden('CSRF検証に失敗しました。');

  const type=String(b.type??'');
  const id=Number(b.id??0);
  const completed=Boolean(b.completed);
  if(!['task','item','shopping','recurrence'].includes(type)||!id)return badRequest('対象が不正です。');
  const now=nowJst();

  if(type==='recurrence'){
    const occId=Number(b.occurrence_id||id);
    const occ=await ctx.env.DB.prepare('SELECT o.id,o.family_id,o.recurrence_rule_id FROM recurrence_occurrences o WHERE o.id=? AND o.family_id=?').bind(occId,m.family_id).first<Row>();
    if(!occ)return json({ok:false,error:'定期タスクの発生日が見つかりません。'},404);
    const rule=await ctx.env.DB.prepare('SELECT r.task_id,t.completion_mode FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.id=? AND r.family_id=?').bind(Number(occ.recurrence_rule_id),m.family_id).first<Row>();
    if(!rule)return json({ok:false,error:'定期タスクのルールが見つかりません。'},404);
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(rule.task_id)).first<Row>();
    const actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(Number(rule.task_id),m.id).first<Row>();
    if(Number(assigned?.c||0)===0)return json({ok:false,error:'担当者が設定されていない定期タスクは完了できません。'},409);
    if(!actorAssigned)return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);
    if(completed){
      await ctx.env.DB.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(occId,m.id,now).run();
    }else{
      await ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?').bind(occId,m.id).run();
    }
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=?').bind(Number(rule.task_id),occId).first<Row>();
    const mode=String(rule.completion_mode||'ANY').toUpperCase();
    const isComplete=mode==='ALL'
      ? Number(assigned?.c||0)>0&&Number(done?.c||0)>=Number(assigned?.c||0)
      : Number(done?.c||0)>0;
    await updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB,{occurrenceId:occId,familyId:m.family_id,isComplete,completedBy:isComplete?m.id:null,now});
    await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','recurrence',occId,{occurrence_id:occId,rule_id:Number(occ.recurrence_rule_id),status:isComplete?'completed':'pending'});
    return commitSession(json({ok:true,status:isComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
  }

  if(type==='task'){
    const task=await ctx.env.DB.prepare(`SELECT t.id,t.status,t.completion_mode,t.task_kind,t.visibility_scope,t.private_owner_id FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
    if(!task)return json({ok:false,error:'タスクが見つかりません。'},404);
    if(String(task.task_kind||'').toLowerCase()==='event')return json({ok:false,error:'イベントは完了チェックの対象外です。'},409);
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(id).first<Row>();
    const actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(id,m.id).first<Row>();
    if(Number(assigned?.c||0)>0&&!actorAssigned)return json({ok:false,error:'このタスクの担当者ではありません。'},403);
    if(completed){
      await ctx.env.DB.prepare('INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(id,m.id,now).run();
      const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=?').bind(id).first<Row>();
      const shouldComplete=Number(assigned?.c||0)>0&&(String(task.completion_mode||'ANY').toUpperCase()==='ALL'?Number(done?.c||0)>=Number(assigned?.c||0):Number(done?.c||0)>0);
      await ctx.env.DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(shouldComplete?'completed':'pending',shouldComplete?m.id:null,shouldComplete?now:null,now,id,m.family_id).run();
    }else{
      await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id=?').bind(id,m.id).run();
      const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(id).first<Row>();
      const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=?').bind(id).first<Row>();
      const mode=String(task.completion_mode||'ANY').toUpperCase();
      const stillComplete=mode==='ALL'?Number(assigned?.c||0)>0&&Number(done?.c||0)>=Number(assigned?.c||0):Number(done?.c||0)>0;
      const latest=stillComplete?await ctx.env.DB.prepare('SELECT member_id,completed_at FROM task_completions WHERE task_id=? ORDER BY completed_at DESC,member_id DESC LIMIT 1').bind(id).first<Row>():null;
      await ctx.env.DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(stillComplete?'completed':'pending',stillComplete?Number(latest?.member_id||0)||null:null,stillComplete?String(latest?.completed_at||now):null,now,id,m.family_id).run();
    }
    if(String((await ctx.env.DB.prepare('SELECT status FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>())?.status||'pending')==='completed')await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,id,m.family_id).run();
    await ctx.env.DB.prepare('INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run();
    await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','task',id,{status:completed?'completed':'pending'});
    const latest=await ctx.env.DB.prepare('SELECT status FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>();
    return commitSession(json({ok:true,status:String(latest?.status||'pending')}),ctx.session,ctx.env.APP_SECRET);
  }

  if(type==='item'){
    const item=await ctx.env.DB.prepare(`SELECT i.id FROM items i WHERE i.id=? AND i.family_id=? AND (i.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.family_id=i.family_id AND ${taskVisibilitySql('t')})) LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
    if(!item)return json({ok:false,error:'持ち物が見つかりません。'},404);
    const itemAssigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=?').bind(id).first<Row>();
    const itemActorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=? AND ia.member_id=? LIMIT 1').bind(id,m.id).first<Row>();
    if(Number(itemAssigned?.c||0)===0)return json({ok:false,error:'担当者が設定されていない持ち物は完了できません。'},409);
    if(!itemActorAssigned)return json({ok:false,error:'この持ち物の担当者ではありません。'},403);
    if(completed)await ctx.env.DB.prepare('INSERT INTO item_completions(item_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(item_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(id,m.id,now).run();
    else await ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=? AND member_id=?').bind(id,m.id).run();
    const itemMode=await ctx.env.DB.prepare('SELECT completion_mode FROM items WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>();
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=?').bind(id).first<Row>();
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=?').bind(id).first<Row>();
    const mode=String(itemMode?.completion_mode||'ANY').toUpperCase();
    const itemComplete=mode==='ALL'?Number(assigned?.c||0)>0&&Number(done?.c||0)>=Number(assigned?.c||0):Number(done?.c||0)>0;
    const latest=itemComplete?await ctx.env.DB.prepare('SELECT member_id,completed_at FROM item_completions WHERE item_id=? ORDER BY completed_at DESC,member_id DESC LIMIT 1').bind(id).first<Row>():null;
    await ctx.env.DB.prepare('UPDATE items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(itemComplete?'completed':'pending',itemComplete?Number(latest?.member_id||0)||null:null,itemComplete?String(latest?.completed_at||now):null,now,id,m.family_id).run();
    await ctx.env.DB.prepare('INSERT INTO item_completion_history(item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run();
    await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','item',id,{status:itemComplete?'completed':'pending'});
    return commitSession(json({ok:true,status:itemComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
  }

  const current=await ctx.env.DB.prepare(`SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${taskVisibilitySql('t')})) LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
  if(!current)return json({ok:false,error:'買い物が見つかりません。'},404);
  const shopTask=await ctx.env.DB.prepare('SELECT task_id FROM shopping_items WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>();
  const linkedTaskId=Number(shopTask?.task_id||0);
  const shopAssigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=?').bind(id).first<Row>();
  const directAssigned=Number(shopAssigned?.c||0);
  const shopActorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=? AND sa.member_id=? LIMIT 1').bind(id,m.id).first<Row>();
  const taskAssigned=directAssigned===0&&linkedTaskId?await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(linkedTaskId).first<Row>():null;
  const inheritedAssigned=Number(taskAssigned?.c||0);
  const taskActorAssigned=directAssigned===0&&inheritedAssigned>0?await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(linkedTaskId,m.id).first<Row>():null;
  if(directAssigned>0&&!shopActorAssigned)return json({ok:false,error:'この買い物の担当者ではありません。'},403);
  if(directAssigned===0&&inheritedAssigned>0&&!taskActorAssigned)return json({ok:false,error:'この買い物に紐づくタスクの担当者ではありません。'},403);
  if(completed)await ctx.env.DB.prepare('INSERT INTO shopping_completions(shopping_item_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(shopping_item_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(id,m.id,now).run();
  else await ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id=?').bind(id,m.id).run();
  const shopDone=directAssigned>0
    ?await ctx.env.DB.prepare('SELECT COUNT(*) c FROM shopping_completions sc JOIN shopping_assignees sa ON sa.shopping_item_id=sc.shopping_item_id AND sa.member_id=sc.member_id JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sc.shopping_item_id=?').bind(id).first<Row>()
    :inheritedAssigned>0
      ?await ctx.env.DB.prepare('SELECT COUNT(*) c FROM shopping_completions sc JOIN task_assignees ta ON ta.member_id=sc.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE sc.shopping_item_id=?').bind(linkedTaskId,id).first<Row>()
      :await ctx.env.DB.prepare('SELECT COUNT(*) c FROM shopping_completions sc JOIN members am ON am.id=sc.member_id AND am.family_id=? AND am.active=1 WHERE sc.shopping_item_id=?').bind(m.family_id,id).first<Row>();
  const shopComplete=Number(shopDone?.c||0)>0;
  const shopLatest=shopComplete?await ctx.env.DB.prepare('SELECT member_id,completed_at FROM shopping_completions WHERE shopping_item_id=? ORDER BY completed_at DESC,member_id DESC LIMIT 1').bind(id).first<Row>():null;
  await ctx.env.DB.prepare('UPDATE shopping_items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(shopComplete?'completed':'pending',shopComplete?Number(shopLatest?.member_id||0)||null:null,shopComplete?String(shopLatest?.completed_at||now):null,now,id,m.family_id).run();
  await ctx.env.DB.prepare('INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run();
  await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','shopping',id,{status:shopComplete?'completed':'pending'});
  return commitSession(json({ok:true,status:shopComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
}