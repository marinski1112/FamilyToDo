import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping-new.js','utf8');

assert.match(source,/const MAX_BATCH_PRODUCTS=64;/,'Shopping batch create must retain an explicit bounded product count');
assert.match(source,/const MAX_PRODUCT_NAME_UNITS=255;/,'Shopping batch create must retain the persisted product-name bound');
assert.match(source,/const MAX_PRODUCT_QUANTITY_UNITS=128;/,'Shopping batch create must bound free-form quantity text');
assert.match(source,/maxlength="128"[^>]*name="product_quantity\[\]"|name="product_quantity\[\]"[^>]*maxlength="128"/,'quantity input must expose the same client-side bound');
assert.match(source,/name="product_url\[\]" maxlength="2048"/,'product URL input must expose the existing URL bound');
assert.match(source,/const safeDueDate=value=>\{[^}]*\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$[^}]*toISOString\(\)\.slice\(0,10\)!==raw\?null:raw;/,'Shopping due date must be validated as a real YYYY-MM-DD date');

const addStart=source.indexOf('add.onclick=()=>{');
const addCreate=source.indexOf("document.createElement('div')",addStart);
const addLimit=source.indexOf("list.querySelectorAll('[data-product-row]').length>=MAX_BATCH_PRODUCTS",addStart);
assert.ok(addStart>=0&&addLimit>addStart&&addLimit<addCreate,'row-count limit must run before a new Shopping product row is created');

const submitStart=source.indexOf('form.onsubmit=async e=>{');
const rowsBound=source.indexOf('rows.length>MAX_BATCH_PRODUCTS',submitStart);
const mapNames=source.indexOf("form.querySelectorAll('[name=\"product_name[]\"]')",submitStart);
const dueDateGuard=source.indexOf("const dueDate=safeDueDate(fd.get('due_date'))",submitStart);
const network=source.indexOf("fetch('/api/shopping'",submitStart);
assert.ok(submitStart>=0&&rowsBound>submitStart&&rowsBound<mapNames,'submission must reject oversized batches before mapping product fields');
assert.ok(network>rowsBound,'batch bounds must be enforced before Shopping network I/O');
assert.ok(dueDateGuard>submitStart&&dueDateGuard<network,'due date validation must run before Shopping network I/O');
assert.match(source,/dueDate===null/,'malformed or impossible due dates must fail closed');
assert.match(source,/due_date:dueDate/,'validated due date must be used in the existing add_batch payload');
assert.match(source,/names\.length!==rows\.length\|\|quantities\.length!==rows\.length\|\|urls\.length!==rows\.length/,'parallel product arrays must stay aligned with bounded visible rows');
assert.match(source,/names\.some\(name=>name\.length>MAX_PRODUCT_NAME_UNITS\)/,'programmatic bypass of product-name maxlength must fail closed');
assert.match(source,/quantities\.some\(quantity=>quantity\.length>MAX_PRODUCT_QUANTITY_UNITS\)/,'programmatic bypass of quantity maxlength must fail closed');
assert.match(source,/const safeUrls=urls\.map\(safeProductUrl\)/,'bounded batch submission must retain product URL validation');
assert.match(source,/const taskId=.*safeEntityId/,'bounded batch submission must retain task reference validation');
assert.match(source,/const assignees=assigneeValues\.map\(safeEntityId\)/,'bounded batch submission must retain assignee reference validation');

assert.doesNotMatch(source,/calendar_perf|\/app\/calendar\.php|CALENDAR_PERF_DIAGNOSTICS/,'Shopping payload bounds must remain isolated from Calendar diagnostics');
assert.doesNotMatch(source,/cookie|authorization|member_name|family_name|private_owner_id/i,'Shopping payload bounds must not add identity/session handling');

console.log('shopping batch payload bounds contract: product count, per-product text, and due date are validated before request assembly/network I/O while existing URL/entity safety remains intact');
