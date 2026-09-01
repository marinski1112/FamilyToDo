import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const taskDelete=fs.readFileSync('src/task-delete.ts','utf8');
if(!index.includes("import { taskDelete } from './task-delete';")) throw new Error('index.ts must import taskDelete module');
if(index.includes('async function taskDelete(')) throw new Error('taskDelete must not remain defined in index.ts');
if(!index.includes("if(url.pathname==='/task/delete.php') return await taskDelete(request,context);")) throw new Error('task delete route wiring changed');
if(!taskDelete.includes('export async function taskDelete(')) throw new Error('taskDelete export missing');
for(const marker of [
  "request.method!=='POST'&&request.method!=='DELETE'",
  "request.headers.get('x-csrf')",
  "role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id",
  "['restore','exclude'].includes(exceptionMode)",
  'archiveRecurrenceOccurrenceCompletionStatements',
  'archiveRecurrenceRuleOccurrenceStatements',
  'archiveShoppingCompletionStatements',
  'archiveItemCompletionStatements',
  'archiveTaskCompletionStatements',
  "DELETE FROM tasks WHERE id=? AND family_id=?",
  'await ctx.env.DB.batch(statements)',
]) if(!taskDelete.includes(marker)) throw new Error(`task delete behavior sentinel missing: ${marker}`);
if(taskDelete.split('queueCalendarProjectionAfterMutation(').length-1<2) throw new Error('calendar delete projection hooks must remain before and after batch');
console.log('task delete modularity contract: ok');
