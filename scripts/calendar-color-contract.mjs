import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const calendar=fs.readFileSync('public/assets/calendar.js','utf8');
const ui=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const edit=fs.readFileSync('public/assets/task-edit.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

execFileSync(process.execPath,['--check','public/assets/calendar-mobile-ui.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','public/assets/task-edit.js'],{stdio:'inherit'});

const timeTreeColors={
  '#f35f8c':'ローズピンク（TimeTree）',
  '#2ecc87':'エメラルド（TimeTree）',
  '#47b2f7':'スカイブルー（TimeTree）',
  '#b38bdc':'ラベンダー（TimeTree）',
  '#fdc02d':'アンバー（TimeTree）',
  '#fb7f77':'コーラル（TimeTree）',
};
for(const [color,name] of Object.entries(timeTreeColors)){
  assert.ok(ui.includes(color),`TimeTree color ${color} must be recognized by Calendar UI`);
  assert.ok(edit.includes(color)&&edit.includes(name),`TimeTree color ${color} must retain task-edit label ${name}`);
}

assert.match(calendar,/function applyStoredCalendarColors\(root\)/,'calendar must apply stored colors in the primary calendar controller');
assert.match(calendar,/\^#\[0-9a-f\]\{6\}\$/i,'calendar colors must be constrained to six-digit HEX values');
assert.ok(ui.includes('const applyStoredCalendarColors=(root,detailData)=>'),'mobile Calendar must reapply stored task colors from Calendar detail data');
assert.ok(ui.includes('/^#[0-9a-f]{6}$/i'),'mobile Calendar color application must accept only safe six-digit HEX values');
assert.match(calendar,/\.calendar-band\[data-task-id\]/,'multi-day bands must receive stored calendar colors');
assert.match(calendar,/\.calendar-items > \.calendar-item:not\(\.item\)/,'single-day schedule rows must receive stored calendar colors');
assert.ok(calendar.includes('Number(row?.spanDays||1)<=1'),'single-day color mapping must use actual span length, not the segment label');
assert.ok(!calendar.includes("String(row?.segment||'single')==='single'"),'segment=start must not delay one-day stored-color application');
assert.ok(!calendar.includes("if(isEvent&&!allowedColors.has(color))link.style.background='#16a34a'"),'calendar must not repaint unknown stored colors to the legacy green fallback');
assert.ok(!calendar.includes('repairEventBandFallbackColors'),'legacy event fallback color repair must be removed');
assert.ok((calendar.match(/applyStoredCalendarColors\(/g)||[]).length>=3,'stored colors must be applied on definition, initial grid, and month replacement');
assert.match(sw,/familytodo-static-calendar-color-prepaint/,'Calendar color mapping changes must rotate the static asset cache');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'service worker must retire prior Family TODO static caches');

console.log('calendar-color-contract: stored HEX and TimeTree palette are applied consistently');
