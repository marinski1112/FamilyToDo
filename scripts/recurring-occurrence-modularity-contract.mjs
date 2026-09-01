import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const occurrence=fs.readFileSync('src/recurring-occurrence.ts','utf8');

if(!index.includes("import { convertOccurrence } from './recurring-occurrence';")) throw new Error('index.ts must import recurring occurrence module');
if(index.includes('async function convertOccurrence(')) throw new Error('convertOccurrence implementation must not remain in index.ts');
if(!index.includes("if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);")) throw new Error('convert occurrence route wiring changed');
if(!occurrence.includes('export async function convertOccurrence(request:Request,ctx:any):Promise<Response>{')) throw new Error('recurring occurrence module must export convertOccurrence');
for(const sentinel of [
  "if(request.method!=='POST')",
  "ct.includes('application/json')",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  'const occId=Number(b.occurrence_id||0)',
  'occ.exception_task_id',
  'INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode',
  "'OCCURRENCE'",
  'INSERT OR IGNORE INTO task_assignees(task_id,member_id)',
  'INSERT OR IGNORE INTO task_completions(task_id,member_id,action,completed_at)',
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)',
  'SELECT * FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id',
  'INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id)',
  'SELECT * FROM items WHERE task_id=? AND family_id=? ORDER BY id',
  'INSERT OR IGNORE INTO item_assignees(item_id,member_id)',
  'UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=?',
  'redirectTo=`/task/view.php?id=${taskId}`',
]) if(!occurrence.includes(sentinel)) throw new Error(`recurring occurrence behavior sentinel missing: ${sentinel}`);
console.log('recurring occurrence modularity contract: ok');
