import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/assets/shopping-task-link.js',import.meta.url),'utf8');
const page=await readFile(new URL('../src/shopping-new-page.ts',import.meta.url),'utf8');
const checklist=await readFile(new URL('../src/task-events-page.ts',import.meta.url),'utf8');
const calendar=await readFile(new URL('../src/calendar-page.ts',import.meta.url),'utf8');

assert.match(source,/const dateOf=task=>task\.start\|\|task\.due\|\|'';/,'task picker start/date fallback must remain start then due');
assert.match(source,/const endOf=task=>task\.end\|\|task\.due\|\|task\.start\|\|'';/,'task picker effective end must retain explicit end, then due, then start');
assert.doesNotMatch(source,/const endOf=task=>task\.end\|\|dateOf\(task\);/,'task picker must not collapse start+due tasks to a one-day range');
assert.match(source,/const overlaps=\(task,date\)=>Boolean\(date&&dateOf\(task\)&&dateOf\(task\)<=date&&\(!endOf\(task\)\|\|endOf\(task\)>=date\)\);/,'task picker overlap filter must use the effective end');
assert.match(source,/let hydrated=false;/,'task picker must distinguish initial hydration from an explicit unlink');
assert.match(source,/const current=hydrated\?rawCurrent:\(rawCurrent\|\|initialSelected\|\|0\);/,'task-linked add must default to the incoming task only during initial hydration');
assert.match(source,/hydrated=true;/,'task picker must stop reapplying the initial task after the first render');
assert.match(source,/a\.id===initialSelected&&b\.id!==initialSelected/,'incoming linked task must sort ahead of other candidates');
assert.match(source,/const DEFAULT_VISIBLE_LIMIT=12;/,'candidate density limit must remain unchanged');
assert.match(source,/searchInput\.type='search';/,'searchable task picker must remain available');
assert.match(page,/CASE WHEN id=\? THEN 0 ELSE 1 END, COALESCE\(start_at,due_at,created_at\) DESC,id DESC/,'server-rendered task choices must prioritize the selected task and recent/current records rather than old rows');
assert.match(checklist,/NOT EXISTS\(SELECT 1 FROM recurrence_rules rr WHERE rr\.task_id=s\.task_id AND rr\.family_id=s\.family_id AND rr\.active=1\)/,'ordinary linked shopping daily ranges must exclude recurrence templates whose projected start date is not persisted');
assert.match(checklist,/date\(COALESCE\(t\.start_at,t\.due_at,t\.end_at\)\)<=date\(\?\)/,'ordinary linked shopping window must begin on the task effective start date');
assert.match(checklist,/date\(COALESCE\(s\.due_date,t\.end_at,t\.due_at,t\.start_at\)\)>=date\(\?\)/,'ordinary linked shopping window must remain visible through its effective shopping deadline');
assert.match(checklist,/\(s\.task_id IS NULL AND s\.due_date IS NOT NULL AND date\(s\.due_date\)>=date\(\?\)\)/,'standalone shopping with a deadline must remain visible through the deadline date');
assert.doesNotMatch(checklist,/\(s\.task_id IS NULL AND s\.due_date IS NOT NULL AND date\(s\.due_date\)=date\(\?\)\)/,'standalone shopping must not be limited to the deadline day');
assert.match(checklist,/\(s\.task_id IS NULL AND s\.due_date IS NULL\)/,'standalone shopping without a deadline must remain continuously visible');
assert.match(checklist,/EXISTS\(SELECT 1 FROM recurrence_rules rr WHERE rr\.task_id=s\.task_id AND rr\.family_id=s\.family_id AND rr\.active=1\)[\s\S]{0,120}date\(s\.due_date\)=date\(\?\)/,'recurrence-linked shopping must fail closed to its explicit deadline instead of using the series template start date');
assert.match(checklist,/通常タスクは関連日から期限まで、定期タスクは期限日に表示/,'checklist copy must describe the safe daily visibility behavior');
assert.match(calendar,/s\.due_date BETWEEN \? AND \?/,'calendar shopping query must remain bounded to actual due dates in the visible calendar range');
assert.match(calendar,/for\(const item of shopping\)\{const d=String\(item\.due_date\|\|''\)\.slice\(0,10\);if\(d\)\(shoppingMap\[d\]\?\?=\[\]\)\.push\(item\);\}/,'calendar shopping must remain projected only onto its due date');

console.log('shopping-task-link-effective-end-contract: ok');
