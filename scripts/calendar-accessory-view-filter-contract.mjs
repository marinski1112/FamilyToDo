import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('src/app.ts','utf8');
const calendarStart=source.indexOf('export async function calendar(');
const calendarEnd=source.indexOf('export function calendarDisplayLabel',calendarStart);
assert.ok(calendarStart>=0&&calendarEnd>calendarStart,'calendar handler must exist');
const calendar=source.slice(calendarStart,calendarEnd);

assert.match(calendar,/const shoppingViewSql=view==='family'\?" AND \(s\.task_id IS NULL OR t\.visibility_scope='FAMILY'\)"/,'family view must exclude shopping attached to PRIVATE tasks while retaining unlinked family shopping');
assert.match(calendar,/view==='assigned'\?" AND \(s\.task_id IS NULL OR t\.visibility_scope='FAMILY'\) AND EXISTS \(SELECT 1 FROM shopping_assignees viewer_sa WHERE viewer_sa\.shopping_item_id=s\.id AND viewer_sa\.member_id=\?\)"/,'assigned view must use shopping assignees and exclude PRIVATE-parent shopping');
assert.match(calendar,/view==='private'\?" AND s\.task_id IS NOT NULL AND t\.visibility_scope='PRIVATE' AND t\.private_owner_id=\?"/,'private view must show only owner-visible shopping attached to PRIVATE tasks');
assert.match(calendar,/const itemViewSql=view==='family'\?" AND \(i\.task_id IS NULL OR pt\.visibility_scope='FAMILY'\)"/,'family view must exclude belongings attached to PRIVATE tasks while retaining unlinked family belongings');
assert.match(calendar,/view==='assigned'\?" AND \(i\.task_id IS NULL OR pt\.visibility_scope='FAMILY'\) AND EXISTS \(SELECT 1 FROM item_assignees viewer_ia WHERE viewer_ia\.item_id=i\.id AND viewer_ia\.member_id=\?\)"/,'assigned view must use item assignees and exclude PRIVATE-parent belongings');
assert.match(calendar,/view==='private'\?" AND i\.task_id IS NOT NULL AND pt\.visibility_scope='PRIVATE' AND pt\.private_owner_id=\?"/,'private view must show only owner-visible belongings attached to PRIVATE tasks');
assert.match(calendar,/\$\{shoppingViewSql\} AND s\.due_date BETWEEN \? AND \?/,'shopping query must apply the active Calendar view');
assert.match(calendar,/\$\{itemViewSql\} AND i\.due_at IS NOT NULL/,'belongings query must apply the active Calendar view');
const binds=calendar.match(/\.bind\(fid,member\.id,\.\.\.accessoryViewBinds,from,to\)\.all<Row>\(\)/g)||[];
assert.equal(binds.length,2,'shopping and belongings queries must bind assigned/private member predicates');
console.log('Calendar accessory view filter contract: ok');
