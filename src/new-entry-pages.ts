import { redirect } from './response';
import { layout } from './app-shell';
import { taskVisibilitySql } from './task-visibility';

export async function itemNew(ctx:any,date:string,selectedTaskId=0):Promise<Response>{
  if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/item/new.php?date='+date));
  const [members,tasks]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all(),
    ctx.env.DB.prepare(`SELECT id,title,start_at,due_at,visibility_scope FROM tasks t WHERE family_id=? AND status<>'completed' AND (visibility_scope='FAMILY' OR (id=? AND ${taskVisibilitySql('t')})) ORDER BY coalesce(start_at,due_at),id LIMIT 200`).bind(ctx.member.family_id,selectedTaskId,ctx.member.id).all()
  ]);
  const selectedTask=tasks.results.find((t:any)=>Number(t.id)===selectedTaskId),privateContext=String(selectedTask?.visibility_scope||'')==='PRIVATE';
  const body=`<div class="card form-card"><h1>🎒 持ち物追加</h1><div id="itemFormError" class="error" style="display:none"></div><form id="itemForm"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><label>持ち物名</label><input name="name" maxlength="255" required autofocus><label>関連タスク</label>${privateContext?`<p class="notice">🔒 自分専用タスク: ${String(selectedTask.title).replace(/[&<>\"]/g,'')}</p><input type="hidden" name="task_id" value="${selectedTaskId}">`:`<select name="task_id"><option value="0">タスクなし</option>${tasks.results.map((t:any)=>`<option value="${t.id}" ${Number(t.id)===selectedTaskId?'selected':''}>${String(t.title).replace(/[&<>\"]/g,'')}</option>`).join('')}</select>`}<label>日付（タスクを指定しない場合）</label><input type="date" name="date" value="${date}"><label>メモ</label><textarea name="memo" maxlength="5000"></textarea><label>担当者</label>${privateContext?'<p class="notice">🔒 自分専用タスクのため、担当者はあなたのみです</p>':`<div class="assignee-list">${members.results.map((m:any)=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>\"]/g,'')}</label>`).join('')}</div>`}<button type="submit">登録する</button></form></div><script src="/assets/item-new.js?v=12.93-wave74"></script>`;
  return new Response(layout('持ち物追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}})
}