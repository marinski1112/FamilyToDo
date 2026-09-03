import fs from 'node:fs';

const api=fs.readFileSync('src/toggle-api.ts','utf8');
const compat=fs.readFileSync('src/recurrence-completion-state.ts','utf8');
const contextRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');

if(api.includes("from './app'")) throw new Error('toggle API must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { updateRecurrenceOccurrenceAggregateCompat } from './recurrence-completion-state';",
  "import { taskVisibilitySql } from './task-visibility';",
  'export async function toggle(request:Request,ctx:AppContext):Promise<Response>{',
  "code:'AUTH_REQUIRED'",
  "CSRF検証に失敗しました。",
  "if(type==='recurrence')",
  "定期タスクの発生日が見つかりません。",
  "定期タスクのルールが見つかりません。",
  'const recurrenceTaskId=Number(rule.task_id);',
  'const assignedCount=Number(assigned?.c||0);',
  "if(assignedCount>0&&!actorAssigned)return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);",
  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)',
  'DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?',
  'const done=assignedCount>0',
  'JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=?',
  "const mode=assignedCount>0?String(rule.completion_mode||'ANY').toUpperCase():'ANY';",
  'const completedBy=isComplete?(Number(latest?.member_id||0)||null):null;',
  'updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB',
  "if(type==='task')",
  "イベントは完了チェックの対象外です。",
  "const assignedCount=Number(assigned?.c||0);",
  "const actorAssigned=assignedCount>0?await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees",
  "if(assignedCount>0&&!actorAssigned)return json({ok:false,error:'このタスクの担当者ではありません。'},403);",
  'const done=assignedCount>0',
  'JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?',
  "const mode=assignedCount>0?String(task.completion_mode||'ANY').toUpperCase():'ANY';",
  "const taskComplete=mode==='ALL'?assignedCount>0&&Number(done?.c||0)>=assignedCount:Number(done?.c||0)>0;",
  'SELECT tc.member_id,tc.completed_at FROM task_completions tc JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?',
  "await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','task',id,{status:taskComplete?'completed':'pending'});",
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)',
  "if(type==='item')",
  'SELECT i.id,i.task_id FROM items i WHERE i.id=? AND i.family_id=?',
  'const itemDirectAssigned=Number(itemAssigned?.c||0);',
  'const itemInheritedAssigned=Number(itemTaskAssigned?.c||0);',
  "if(itemDirectAssigned>0&&!itemActorAssigned)return json({ok:false,error:'この持ち物の担当者ではありません。'},403);",
  "if(itemDirectAssigned===0&&itemInheritedAssigned>0&&!itemTaskActorAssigned)return json({ok:false,error:'この持ち物に紐づくタスクの担当者ではありません。'},403);",
  'const itemEffectiveAssigned=itemDirectAssigned>0?itemDirectAssigned:itemInheritedAssigned;',
  'JOIN members am ON am.id=ic.member_id AND am.family_id=? AND am.active=1 WHERE ic.item_id=?',
  "const mode=itemEffectiveAssigned>0?String(itemMode?.completion_mode||'ANY').toUpperCase():'ANY';",
  'INSERT INTO item_completion_history(item_id,member_id,action,occurred_at)',
  'SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=?',
  'SELECT task_id FROM shopping_items WHERE id=? AND family_id=?',
  'const directAssigned=Number(shopAssigned?.c||0);',
  'const inheritedAssigned=Number(taskAssigned?.c||0);',
  "if(directAssigned>0&&!shopActorAssigned)return json({ok:false,error:'この買い物の担当者ではありません。'},403);",
  "if(directAssigned===0&&inheritedAssigned>0&&!taskActorAssigned)return json({ok:false,error:'この買い物に紐づくタスクの担当者ではありません。'},403);",
  'JOIN members am ON am.id=sc.member_id AND am.family_id=? AND am.active=1 WHERE sc.shopping_item_id=?',
  'const shopComplete=Number(shopDone?.c||0)>0;',
  'SELECT sc.member_id,sc.completed_at FROM shopping_completions sc JOIN shopping_assignees sa ON sa.shopping_item_id=sc.shopping_item_id AND sa.member_id=sc.member_id JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sc.shopping_item_id=? ORDER BY sc.completed_at DESC,sc.member_id DESC LIMIT 1',
  'SELECT sc.member_id,sc.completed_at FROM shopping_completions sc JOIN task_assignees ta ON ta.member_id=sc.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE sc.shopping_item_id=? ORDER BY sc.completed_at DESC,sc.member_id DESC LIMIT 1',
  'SELECT sc.member_id,sc.completed_at FROM shopping_completions sc JOIN members am ON am.id=sc.member_id AND am.family_id=? AND am.active=1 WHERE sc.shopping_item_id=? ORDER BY sc.completed_at DESC,sc.member_id DESC LIMIT 1',
  'INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at)',
  "taskVisibilitySql('t')",
]) if(!api.includes(marker)) throw new Error(`retained toggle behavior marker missing: ${marker}`);

for(const forbiddenSql of [
  'SELECT task_id,completion_mode FROM recurrence_rules',
  'SELECT s.id,s.completion_mode FROM shopping_items',
  'current.completion_mode',
  'SELECT member_id,completed_at FROM shopping_completions WHERE shopping_item_id=? ORDER BY completed_at DESC,member_id DESC LIMIT 1',
]) if(api.includes(forbiddenSql)) throw new Error(`toggle must not query invalid or unscoped completion data: ${forbiddenSql}`);
if(api.includes('担当者が設定されていない定期タスクは完了できません。')) throw new Error('unassigned recurrence must remain completable by an active family member');
if(api.includes('担当者が設定されていないタスクは完了できません。')) throw new Error('unassigned task must remain completable by an active family member');
if(api.includes('担当者が設定されていない持ち物は完了できません。')) throw new Error('unassigned item must remain completable by an active family member');
if(api.includes('担当者が設定されていない買い物は完了できません。')) throw new Error('unassigned shopping must remain completable by an active family member');

for(const marker of [
  "PRAGMA table_info(recurrence_occurrences)",
  "if(!columns.has('status'))throw new Error('recurrence_occurrences.status is required')",
  "if(columns.has('completed_by'))",
  "if(columns.has('completed_at'))",
  "if(columns.has('updated_at'))",
  "assignments.join(',')",
]) if(!compat.includes(marker)) throw new Error(`recurrence compatibility marker missing: ${marker}`);

if(!contextRoutes.includes("import { toggle } from './toggle-api';")) throw new Error('/api/toggle must use retained toggle API');
if(!contextRoutes.includes("if(url.pathname==='/api/toggle') return await toggle(request,context);")) throw new Error('/api/toggle route changed');
if(contextRoutes.includes("from './app'")) throw new Error('context API routes must not depend on app.ts');
if(!exceptionRoutes.includes("import { toggle } from './toggle-api';")) throw new Error('legacy check route must use retained toggle API');
if(!exceptionRoutes.includes("if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);")) throw new Error('legacy check route changed');
const appImport=exceptionRoutes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\btoggle\b/.test(appImport)) throw new Error('exception routes must not import toggle from app.ts');

console.log('toggle-api-boundary: retained routing, authorization, assignment fallback and D1 schema compatibility ok');
