import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page=await readFile(new URL('../src/shopping-new-page.ts',import.meta.url),'utf8');
const checklist=await readFile(new URL('../src/task-events-page.ts',import.meta.url),'utf8');
const calendar=await readFile(new URL('../src/calendar-page.ts',import.meta.url),'utf8');

assert.doesNotMatch(page,/task_id|assignees|shopping-task-link/,'new Shopping page must not render linkage controls');
assert.match(checklist,/s\.due_date IS NOT NULL AND date\(s\.due_date\)>=date\(\?\)/,'independent shopping with a deadline must remain visible through the deadline date');
assert.match(checklist,/OR s\.due_date IS NULL/,'pending independent shopping without a deadline must remain continuously visible');
assert.ok(checklist.includes("${checklistCompletionSql('s')}"),'shared completion boundary applies to both dated and undated Shopping');
assert.match(calendar,/s\.due_date BETWEEN \? AND \?/,'calendar shopping query must remain bounded to actual due dates in the visible calendar range');

console.log('shopping-task-link-effective-end-contract: independent Shopping create has no task picker and standalone date behavior remains stable');
