import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');

if(!apiRoutes.includes("import { taskApi } from './task-api';")) throw new Error('context API dispatcher must import task API module');
if(index.includes('async function taskApi(')||index.includes('function calendarVisibleFlag(')) throw new Error('task API implementation/helper must not remain in index.ts');
if(!apiRoutes.includes("if(url.pathname==='/api/task') return await taskApi(request,context);")) throw new Error('task API route wiring changed');
if(!taskApi.includes('export async function taskApi(request:Request,ctx:any):Promise<Response>{')) throw new Error('task API module must export taskApi');
for(const sentinel of [
  "if(request.method==='DELETE')",
  "String(ctx.session.csrfToken||'')",
  "taskVisibilitySql('t')",
  'archiveRecurrenceRuleOccurrenceStatements',
  'archiveShoppingCompletionStatements',
  'archiveItemCompletionStatements',
  'archiveTaskCompletionStatements',
  'queueCalendarProjectionAfterMutation',
  'wakeCalendarOutbox',
  'buildStoredTaskRange',
  "reminderRaw && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/",
  "['http:','https:'].includes(parsed.protocol)",
  "visibility_scope,private_owner_id",
  "isPrivate?[m.id]",
  "INSERT OR IGNORE INTO task_assignees(task_id,member_id)",
  "INSERT INTO shopping_items(family_id,name,quantity,category",
  "INSERT INTO items(family_id,name,memo,due_at,status,completion_mode",
  "INSERT INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at)",
  'logTaskCreationCleanupFailure',
  "'CREATED','task'",
  "return json({ok:true,id},201)",
]){
  if(!taskApi.includes(sentinel)) throw new Error(`task API behavior sentinel missing: ${sentinel}`);
}
console.log('task API modularity contract: ok');
