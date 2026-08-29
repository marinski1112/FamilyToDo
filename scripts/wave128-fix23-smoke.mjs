import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const ui=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

execFileSync(process.execPath,['--check','public/assets/calendar-mobile-ui.js'],{stdio:'inherit'});

assert.ok(ui.includes("Number(row?.spanDays||1)<=1"),'stored-color mapping must treat one-day rows as singles even when server segment is start');
assert.ok(ui.includes(".calendar-items > .calendar-item:not(.item)"),'schedule cap must include recurring/task/event rows but exclude carry-item accessory rows');
assert.ok(ui.includes("row.style.setProperty('display','none','important')"),'third and later schedule rows must be hidden with inline important precedence');
assert.ok(ui.includes("singles.forEach((row,index)=>setOverflowHidden(row,index>=singleSlots))"),'all one-day schedule rows, including recurring rows, must obey remaining two-row slots');
assert.ok(ui.includes("setOverflowHidden(band,bandLane(band)>2)"),'multi-day bands must also obey the two-row cap');
assert.match(sw,/familytodo-static-wave128-fix23/,'static cache must rotate for the hardened Calendar asset');
console.log('wave128 fix23 smoke: imported colors and recurring-aware hard two-row cap ok');
