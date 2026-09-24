import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const occurrence=fs.readFileSync('src/recurring-occurrence.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');

if(!exceptionRoutes.includes("import { convertOccurrence } from './recurring-occurrence';")) throw new Error('exception routes must import recurring occurrence module');
if(index.includes('async function convertOccurrence(')) throw new Error('convertOccurrence implementation must not remain in index.ts');
if(!exceptionRoutes.includes("if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);")) throw new Error('convert occurrence route wiring changed');
if(!occurrence.includes('export async function convertOccurrence(request:Request,ctx:any):Promise<Response>{')) throw new Error('recurring occurrence module must export convertOccurrence');
for(const sentinel of [
  "if(request.method!=='POST')",
  "ct.includes('application/json')",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  'const occId=Number(b.occurrence_id||0)',
  'occ.exception_task_id',
  'function shiftedOccurrenceEndDate(occurrenceDate:string,templateStartAt:unknown,templateEndAt:unknown):string',
  'const endDate=shiftedOccurrenceEndDate(date,occ.start_at,occ.end_at)',
  'et?`${endDate} ${et}`:null',
  'INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode',
  "'OCCURRENCE'",
  "String(occ.visibility_scope||'FAMILY'),occ.private_owner_id||null",
  'INSERT OR IGNORE INTO task_completions(task_id,member_id,action,completed_at)',
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)',
  'UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=?',
  'redirectTo=`/task/view.php?id=${taskId}`',
]) if(!occurrence.includes(sentinel)) throw new Error(`recurring occurrence behavior sentinel missing: ${sentinel}`);
for(const retired of [
  'SELECT * FROM shopping_items WHERE task_id=',
  'INSERT INTO shopping_items',
  'shopping_assignees',
  'SELECT * FROM items WHERE task_id=',
  'INSERT INTO items',
  'item_assignees',
]) if(occurrence.includes(retired)) throw new Error(`recurrence exception must not clone linked goods: ${retired}`);
if(occurrence.includes('et?`${date} ${et}`:null')) throw new Error('multi-day recurring exception conversion must not collapse end_at onto the occurrence start date');
console.log('recurring occurrence modularity contract: task state is preserved while independent goods are never cloned');