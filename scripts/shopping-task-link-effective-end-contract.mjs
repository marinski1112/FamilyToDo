import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/assets/shopping-task-link.js',import.meta.url),'utf8');

assert.match(source,/const dateOf=task=>task\.start\|\|task\.due\|\|'';/,'task picker start/date fallback must remain start then due');
assert.match(source,/const endOf=task=>task\.end\|\|task\.due\|\|task\.start\|\|'';/,'task picker effective end must retain explicit end, then due, then start');
assert.doesNotMatch(source,/const endOf=task=>task\.end\|\|dateOf\(task\);/,'task picker must not collapse start+due tasks to a one-day range');
assert.match(source,/const overlaps=\(task,date\)=>Boolean\(date&&dateOf\(task\)&&dateOf\(task\)<=date&&\(!endOf\(task\)\|\|endOf\(task\)>=date\)\);/,'task picker overlap filter must use the effective end');
assert.match(source,/const DEFAULT_VISIBLE_LIMIT=12;/,'candidate density limit must remain unchanged');
assert.match(source,/searchInput\.type='search';/,'searchable task picker must remain available');

console.log('shopping-task-link-effective-end-contract: ok');
