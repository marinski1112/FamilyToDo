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
  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)',
  'JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=?',
  'const completedBy=isComplete?(Number(latest?.member_id||0)||null):null;',
  'const isComplete=Number(done?.c||0)>0;',
  'updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB',
  "if(type==='task')",
  "イベントは完了チェックの対象外です。",
  'JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?',
  'SELECT tc.member_id,tc.completed_at FROM task_completions tc JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?',
  "await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','task',id,{status:taskComplete?'completed':'pending'});",
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)',
  "if(type==='item')",
  'SELECT i.id FROM items i WHERE i.id=? AND i.family_id=?',
  "goodsVisibilitySql('i')",
  'JOIN members am ON am.id=ic.member_id AND am.family_id=? AND am.active=1 WHERE ic.item_id=?',
  'const itemComplete=Number(done?.c||0)>0;',
  'INSERT INTO item_completion_history(item_id,member_id,action,occurred_at)',
  'SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=?',
  "goodsVisibilitySql('s')",
  'JOIN members am ON am.id=sc.member_id AND am.family_id=? AND am.active=1 WHERE sc.shopping_item_id=?',
  'const shopComplete=Number(shopDone?.c||0)>0;',
  'SELECT sc.member_id,sc.completed_at FROM shopping_completions sc JOIN members am ON am.id=sc.member_id AND am.family_id=? AND am.active=1 WHERE sc.shopping_item_id=? ORDER BY sc.completed_at DESC,sc.member_id DESC LIMIT 1',
  'INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at)',
  "taskVisibilitySql('t')",
]) if(!api.includes(marker)) throw new Error(`retained toggle behavior marker missing: ${marker}`);

for(const retired of ['task_assignees','item_assignees','shopping_assignees','itemLinkedTaskId','linkedTaskId'])if(api.includes(retired))throw new Error('goods completion must not depend on assignment or parent: '+retired);
if(!api.includes('DELETE FROM task_completions WHERE task_id=?')||!api.includes('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=?'))throw new Error('undo must clear shared completion state');

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

const recurrenceBlock=api.match(/if\(type==='recurrence'\)\{([\s\S]*?)\n  if\(type==='task'\)\{/u)?.[1]||'';
if(!recurrenceBlock) throw new Error('recurrence completion block missing');
for(const marker of [
  'const recurrenceCompletionMutation=completed',
  'DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=?',
  'ON CONFLICT(occurrence_id,member_id) DO NOTHING',
  'const recurrenceStateChanged=Number(recurrenceCompletionMutation.meta?.changes||0)>0;',
  'if(recurrenceStateChanged){',
]) if(!recurrenceBlock.includes(marker)) throw new Error(`recurrence retry idempotency marker missing: ${marker}`);
if(recurrenceBlock.includes('ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at')) throw new Error('same-state recurrence completion retry must not refresh member completed_at');
if(!/if\(recurrenceStateChanged\)\{[\s\S]*updateRecurrenceOccurrenceAggregateCompat\(ctx\.env\.DB[\s\S]*logActivity\(ctx,completed\?'COMPLETED':'UNCOMPLETED','recurrence'/u.test(recurrenceBlock)) throw new Error('recurrence aggregate/activity writes must be gated by a real member completion transition');

const taskBlock=api.match(/if\(type==='task'\)\{([\s\S]*?)\n  if\(type==='item'\)\{/u)?.[1]||'';
if(!taskBlock) throw new Error('task completion block missing');
for(const marker of [
  'const taskCompletionMutation=completed',
  'DELETE FROM task_completions WHERE task_id=?',
  'ON CONFLICT(task_id,member_id) DO NOTHING',
  'const taskStateChanged=Number(taskCompletionMutation.meta?.changes||0)>0;',
  'if(taskStateChanged){',
]) if(!taskBlock.includes(marker)) throw new Error(`task retry idempotency marker missing: ${marker}`);
if(taskBlock.includes('ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at')) throw new Error('same-state task completion retry must not refresh member completed_at');
if(!/if\(taskStateChanged\)\{[\s\S]*UPDATE tasks SET status=[\s\S]*INSERT INTO task_completion_history[\s\S]*logActivity\(ctx,completed\?'COMPLETED':'UNCOMPLETED','task'/u.test(taskBlock)) throw new Error('task aggregate/history/activity writes must be gated by a real member completion transition');

const itemBlock=api.match(/if\(type==='item'\)\{([\s\S]*?)\n  const current=/u)?.[1]||'';
if(!itemBlock) throw new Error('item completion block missing');
for(const marker of [
  'const itemCompletionMutation=completed',
  'ON CONFLICT(item_id,member_id) DO NOTHING',
  'const itemStateChanged=Number(itemCompletionMutation.meta?.changes||0)>0;',
  'if(itemStateChanged){',
]) if(!itemBlock.includes(marker)) throw new Error(`item retry idempotency marker missing: ${marker}`);
if(itemBlock.includes('ON CONFLICT(item_id,member_id) DO UPDATE SET completed_at=excluded.completed_at')) throw new Error('same-state item completion retry must not refresh member completed_at');
if(!/if\(itemStateChanged\)\{[\s\S]*UPDATE items SET status=[\s\S]*INSERT INTO item_completion_history[\s\S]*logActivity\(ctx,completed\?'COMPLETED':'UNCOMPLETED','item'/u.test(itemBlock)) throw new Error('item aggregate/history/activity writes must be gated by a real member completion transition');

const shoppingBlock=api.match(/\n  const current=([\s\S]*?)\n  return commitSession\(json\(\{ok:true,status:shopComplete\?'completed':'pending'\}\),ctx.session,ctx.env.APP_SECRET\);/u)?.[1]||'';
if(!shoppingBlock) throw new Error('shopping completion block missing');
for(const marker of [
  'const shoppingCompletionMutation=completed',
  'ON CONFLICT(shopping_item_id,member_id) DO NOTHING',
  'const shoppingStateChanged=Number(shoppingCompletionMutation.meta?.changes||0)>0;',
  'if(shoppingStateChanged){',
]) if(!shoppingBlock.includes(marker)) throw new Error(`shopping retry idempotency marker missing: ${marker}`);
if(shoppingBlock.includes('ON CONFLICT(shopping_item_id,member_id) DO UPDATE SET completed_at=excluded.completed_at')) throw new Error('same-state shopping completion retry must not refresh member completed_at');
if(!/if\(shoppingStateChanged\)\{[\s\S]*UPDATE shopping_items SET status=[\s\S]*INSERT INTO shopping_completion_history[\s\S]*logActivity\(ctx,completed\?'COMPLETED':'UNCOMPLETED','shopping'/u.test(shoppingBlock)) throw new Error('shopping aggregate/history/activity writes must be gated by a real member completion transition');

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

console.log('toggle-api-boundary: retained routing, ownership, shared undo, retry idempotency and D1 schema compatibility ok');
