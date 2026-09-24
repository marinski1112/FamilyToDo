import { goodsVisibilitySql } from './goods-visibility';
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
    const rule=await ctx.env.DB.prepare(`SELECT r.task_id FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.id=? AND r.family_id=? AND ${taskVisibilitySql('t')}`).bind(Number(occ.recurrence_rule_id),m.family_id,m.id).first<Row>();
    if(!rule)return json({ok:false,error:'定期タスクのルールが見つかりません。'},404);
    const recurrenceTaskId=Number(rule.task_id);
    const recurrenceCompletionMutation=completed
      ?await ctx.env.DB.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO NOTHING').bind(occId,m.id,now).run()
      :await ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=?').bind(occId).run();
    const recurrenceStateChanged=Number(recurrenceCompletionMutation.meta?.changes||0)>0;
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=?').bind(m.family_id,occId).first<Row>();
    const isComplete=Number(done?.c||0)>0;
    const latest=isComplete
      ?await ctx.env.DB.prepare('SELECT c.member_id,c.completed_at FROM recurrence_occurrence_completions c JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=? ORDER BY c.completed_at DESC,c.member_id DESC LIMIT 1').bind(m.family_id,occId).first<Row>()
      :null;
    const completedBy=isComplete?(Number(latest?.member_id||0)||null):null;
    if(recurrenceStateChanged){
      await updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB,{occurrenceId:occId,familyId:m.family_id,isComplete,completedBy,now});
      await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','recurrence',occId,{occurrence_id:occId,rule_id:Number(occ.recurrence_rule_id),status:isComplete?'completed':'pending'});
    }
    return commitSession(json({ok:true,status:isComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
  }

  if(type==='task'){
    const task=await ctx.env.DB.prepare(`SELECT t.id,t.status,t.completion_mode,t.task_kind,t.visibility_scope,t.private_owner_id FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
    if(!task)return json({ok:false,error:'タスクが見つかりません。'},404);
    if(String(task.task_kind||'').toLowerCase()==='event')return json({ok:false,error:'イベントは完了チェックの対象外です。'},409);
    const taskCompletionMutation=completed
      ?await ctx.env.DB.prepare('INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(task_id,member_id) DO NOTHING').bind(id,m.id,now).run()
      :await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?').bind(id).run();
    const taskStateChanged=Number(taskCompletionMutation.meta?.changes||0)>0;
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?').bind(m.family_id,id).first<Row>();
    const taskComplete=Number(done?.c||0)>0;
    const taskLatest=taskComplete
      ?await ctx.env.DB.prepare('SELECT tc.member_id,tc.completed_at FROM task_completions tc JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=? ORDER BY tc.completed_at DESC,tc.member_id DESC LIMIT 1').bind(m.family_id,id).first<Row>()
      :null;
    if(taskStateChanged){
      await ctx.env.DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(taskComplete?'completed':'pending',taskComplete?Number(taskLatest?.member_id||0)||null:null,taskComplete?String(taskLatest?.completed_at||now):null,now,id,m.family_id).run();
      if(taskComplete)await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,id,m.family_id).run();
      await ctx.env.DB.prepare('INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run();
      await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','task',id,{status:taskComplete?'completed':'pending'});
    }
    return commitSession(json({ok:true,status:taskComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
  }

  if(type==='item'){
    const item=await ctx.env.DB.prepare(`SELECT i.id FROM items i WHERE i.id=? AND i.family_id=? AND ${goodsVisibilitySql('i')} LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
    if(!item)return json({ok:false,error:'持ち物が見つかりません。'},404);
    const itemCompletionMutation=completed
      ?await ctx.env.DB.prepare('INSERT INTO item_completions(item_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(item_id,member_id) DO NOTHING').bind(id,m.id,now).run()
      :await ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=? AND member_id=?').bind(id,m.id).run();
    const itemStateChanged=Number(itemCompletionMutation.meta?.changes||0)>0;
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM item_completions ic JOIN members am ON am.id=ic.member_id AND am.family_id=? AND am.active=1 WHERE ic.item_id=?').bind(m.family_id,id).first<Row>();
    const itemComplete=Number(done?.c||0)>0;
    const latest=itemComplete
      ?await ctx.env.DB.prepare('SELECT ic.member_id,ic.completed_at FROM item_completions ic JOIN members am ON am.id=ic.member_id AND am.family_id=? AND am.active=1 WHERE ic.item_id=? ORDER BY ic.completed_at DESC,ic.member_id DESC LIMIT 1').bind(m.family_id,id).first<Row>()
      :null;
    if(itemStateChanged){
      await ctx.env.DB.prepare('UPDATE items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(itemComplete?'completed':'pending',itemComplete?Number(latest?.member_id||0)||null:null,itemComplete?String(latest?.completed_at||now):null,now,id,m.family_id).run();
      await ctx.env.DB.prepare('INSERT INTO item_completion_history(item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run();
      await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','item',id,{status:itemComplete?'completed':'pending'});
    }
    return commitSession(json({ok:true,status:itemComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
  }

  const current=await ctx.env.DB.prepare(`SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=? AND ${goodsVisibilitySql('s')} LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
  if(!current)return json({ok:false,error:'買い物が見つかりません。'},404);
  const shoppingCompletionMutation=completed
    ?await ctx.env.DB.prepare('INSERT INTO shopping_completions(shopping_item_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(shopping_item_id,member_id) DO NOTHING').bind(id,m.id,now).run()
    :await ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id=?').bind(id,m.id).run();
  const shoppingStateChanged=Number(shoppingCompletionMutation.meta?.changes||0)>0;
  const shopDone=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM shopping_completions sc JOIN members am ON am.id=sc.member_id AND am.family_id=? AND am.active=1 WHERE sc.shopping_item_id=?').bind(m.family_id,id).first<Row>();
  const shopComplete=Number(shopDone?.c||0)>0;
  const shopLatest=shopComplete
    ?await ctx.env.DB.prepare('SELECT sc.member_id,sc.completed_at FROM shopping_completions sc JOIN members am ON am.id=sc.member_id AND am.family_id=? AND am.active=1 WHERE sc.shopping_item_id=? ORDER BY sc.completed_at DESC,sc.member_id DESC LIMIT 1').bind(m.family_id,id).first<Row>()
    :null;
  if(shoppingStateChanged){
    await ctx.env.DB.prepare('UPDATE shopping_items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(shopComplete?'completed':'pending',shopComplete?Number(shopLatest?.member_id||0)||null:null,shopComplete?String(shopLatest?.completed_at||now):null,now,id,m.family_id).run();
    await ctx.env.DB.prepare('INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run();
    await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','shopping',id,{status:shopComplete?'completed':'pending'});
  }
  return commitSession(json({ok:true,status:shopComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
}
