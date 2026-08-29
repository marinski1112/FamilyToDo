import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const ui=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
execFileSync(process.execPath,['--check','public/assets/calendar-mobile-ui.js'],{stdio:'inherit'});

assert.ok(ui.includes('calendar-overflow-indicator'));
assert.ok(ui.includes('Math.max(0,rows.length-2)'));
assert.ok(ui.includes('… +${hidden}'));
assert.ok(ui.includes(':nth-child(n+3):not(.calendar-overflow-indicator)'));
assert.ok(ui.includes('`ほか${hidden}件の予定`'));
assert.ok(ui.includes('requestAnimationFrame'));
assert.ok(sw.includes("familytodo-static-wave128-fix19"));
console.log('wave128 fix19 smoke: two visible Calendar items plus hidden-count indicator ok');
