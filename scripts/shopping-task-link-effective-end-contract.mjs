import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/assets/shopping-task-link.js',import.meta.url),'utf8');
const page=await readFile(new URL('../src/shopping-new-page.ts',import.meta.url),'utf8');
const checklist=await readFile(new URL('../src/task-events-page.ts',import.meta.url),'utf8');

assert.match(source,/const dateOf=task=>task\.start\|\|task\.due\|\|'';/,'task picker start/date fallback must remain start then due');
assert.match(source,/const endOf=task=>task\.end\|\|task\.due\|\|task\.start\|\|'';/,'task picker effective end must retain explicit end, then due, then start');
assert.doesNotMatch(source,/const endOf=task=>task\.end\|\|dateOf\(task\);/,'task picker must not collapse start+due tasks to a one-day range');
assert.match(source,/const overlaps=\(task,date\)=>Boolean\(date&&dateOf\(task\)&&dateOf\(task\)<=date&&\(!endOf\(task\)\|\|endOf\(task\)>=date\)\);/,'task picker overlap filter must use the effective end');
assert.match(source,/const current=Number\(select\.value\|\|0\)\|\|initialSelected\|\|0;/,'task-linked add must retain the incoming task as the default selection even while the select still reports zero');
assert.match(source,/a\.id===initialSelected&&b\.id!==initialSelected/,'incoming linked task must sort ahead of other candidates');
assert.match(source,/const DEFAULT_VISIBLE_LIMIT=12;/,'candidate density limit must remain unchanged');
assert.match(source,/searchInput\.type='search';/,'searchable task picker must remain available');
assert.match(page,/CASE WHEN id=\? THEN 0 ELSE 1 END, COALESCE\(start_at,due_at,created_at\) DESC,id DESC/,'server-rendered task choices must prioritize the selected task and recent/current records rather than old rows');
assert.match(checklist,/date\(COALESCE\(t\.start_at,t\.due_at,t\.end_at\)\)<=date\(\?\)/,'linked shopping window must begin on the task effective start date');
assert.match(checklist,/date\(COALESCE\(s\.due_date,t\.end_at,t\.due_at,t\.start_at\)\)>=date\(\?\)/,'linked shopping window must remain visible through its effective shopping deadline');
assert.match(checklist,/関連タスクの日から期限まで/,'checklist copy must describe the retained daily visibility contract');

console.log('shopping-task-link-effective-end-contract: ok');
