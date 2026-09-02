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
  "担当者が設定されていない定期タスクは完了できません。",
  "この定期タスクの担当者ではありません。",
  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)',
  'DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?',
  'updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB',
  "if(type==='task')",
  "イベントは完了チェックの対象外です。",
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)',
  "if(type==='item')",
  'INSERT INTO item_completion_history(item_id,member_id,action,occurred_at)',
  'INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at)',
  "taskVisibilitySql('t')",
]) if(!api.includes(marker)) throw new Error(`retained toggle behavior marker missing: ${marker}`);

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

console.log('toggle-api-boundary: retained routing, authorization and recurrence compatibility ok');
