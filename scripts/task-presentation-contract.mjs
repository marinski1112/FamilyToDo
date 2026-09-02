import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const app=retainedAppContractSource();
const taskEvents=fs.readFileSync('public/assets/task-events.js','utf8');
const css=fs.readFileSync('public/assets/family.css','utf8');

assert.ok(app.includes('task-main-row'),'task rows must retain the main-row presentation hook');
assert.ok(app.includes('shoppingBlock=taskShopping||childItems'),'task shopping display must continue to include child items as fallback content');
assert.ok(taskEvents.includes("classList.toggle('completed',checked)"),'task completion must update row presentation in place');
assert.ok(!taskEvents.includes('expiredRow.remove()'),'completing an expired task must not remove the row from the current view');
assert.ok(!app.includes('<small>タップで記録</small>'),'obsolete quick-chore tap hint must remain absent');
assert.ok(css.includes('flex-direction:row'),'task presentation stylesheet must retain horizontal row layout support');

console.log('task-presentation-contract: task rows, shopping fallback, completion state, expired rows, and layout ok');
