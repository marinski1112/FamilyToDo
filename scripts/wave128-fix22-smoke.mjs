import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const ui=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const edit=fs.readFileSync('public/assets/task-edit.js','utf8');
const ics=fs.readFileSync('src/calendar-ics-import.ts','utf8');

execFileSync(process.execPath,['--check','public/assets/calendar-mobile-ui.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','public/assets/task-edit.js'],{stdio:'inherit'});

const colors={
  '#f35f8c':'ローズピンク（TimeTree）',
  '#2ecc87':'エメラルド（TimeTree）',
  '#47b2f7':'スカイブルー（TimeTree）',
  '#b38bdc':'ラベンダー（TimeTree）',
  '#fdc02d':'アンバー（TimeTree）',
  '#fb7f77':'コーラル（TimeTree）',
};
for(const [color,name] of Object.entries(colors)){
  assert.ok(ui.includes(color),`TimeTree color ${color} must be recognized by Calendar UI`);
  assert.ok(edit.includes(color)&&edit.includes(name),`TimeTree color ${color} must have the label ${name}`);
}
assert.ok(ui.includes('applyStoredCalendarColors'),'Calendar UI must reapply stored task calendar_color values');
assert.ok(ui.includes('/^#[0-9a-f]{6}$/i'),'Calendar color application must accept only safe six-digit hex values');
assert.ok(ui.includes('bandsForCell')&&ui.includes('singleSlots'),'Calendar cap must combine spanning bands with same-day rows');
assert.ok(ui.includes("band.classList.toggle('calendar-overflow-hidden',bandLane(band)>2)"),'Calendar must hide multi-day band lanes beyond the two-row cap');
assert.ok(ui.includes("schedule?.closest?.('.calendar-cell')||cellAtPoint(point)"),'multi-day band preview must resolve the pressed date cell');
assert.ok(ui.includes('schedulesForCell(cell)'),'press preview must include spanning bands on every covered date');
assert.ok(ics.includes('calendar_color,task_kind'),'ICS import must persist calendar_color');
assert.ok(ics.includes('e.color'),'ICS import must bind parsed COLOR to calendar_color');
console.log('wave128 fix22 smoke: TimeTree colors, mixed two-row cap, and multi-day date preview ok');
