import fs from 'node:fs';
import assert from 'node:assert/strict';

const events=fs.readFileSync(new URL('../public/assets/task-events.js',import.meta.url),'utf8');
const followup=fs.readFileSync(new URL('../public/assets/checklist-reminders-followup.js',import.meta.url),'utf8');

assert.match(events,/familytodo:toggle-success/,'canonical toggle handler must signal server-confirmed success');
assert.match(events,/completed:serverCompleted/,'success signal must carry server completion state');
assert.match(followup,/familytodo:toggle-success/,'new-row cleanup must wait for canonical success signal');
assert.doesNotMatch(followup,/12000|performance\.now\(\)/,'new-row cleanup must not use a timeout as a success proxy');
assert.match(followup,/event\.detail\?\.completed/,'new-row cleanup must require server-confirmed completion');

console.log('checklist toggle success contract: ok');
