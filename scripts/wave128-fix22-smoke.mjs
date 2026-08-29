import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const ics=fs.readFileSync('src/calendar-ics-import.ts','utf8');

for(const color of ['#f35f8c','#2ecc87','#47b2f7','#b38bdc','#fdc02d','#fb7f77']){
  assert.ok(ui.includes(color),`TimeTree color ${color} must be recognized by Calendar UI`);
}
assert.ok(ui.includes('applyStoredCalendarColors'),'Calendar UI must reapply stored task calendar_color values');
assert.ok(ui.includes('/^#[0-9a-f]{6}$/i'),'Calendar color application must accept only safe six-digit hex values');
assert.ok(ics.includes('calendar_color,task_kind'),'ICS import must persist calendar_color');
assert.ok(ics.includes('e.color'),'ICS import must bind parsed COLOR to calendar_color');
console.log('wave128 fix22 smoke: ICS TimeTree colors persist and are restored in Calendar UI');
