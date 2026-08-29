import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('public/assets/calendar.js','utf8');

assert.match(calendar,/function applyStoredCalendarColors\(root\)/,'calendar must apply stored colors in the primary calendar controller');
assert.match(calendar,/\^#\[0-9a-f\]\{6\}\$/i,'calendar colors must be constrained to six-digit HEX values');
assert.match(calendar,/\.calendar-band\[data-task-id\]/,'multi-day bands must receive stored calendar colors');
assert.match(calendar,/\.calendar-items > \.calendar-item:not\(\.item\)/,'single-day schedule rows must receive stored calendar colors');
assert.ok(!calendar.includes("if(isEvent&&!allowedColors.has(color))link.style.background='#16a34a'"),'calendar must not repaint unknown stored colors to the legacy green fallback');
assert.ok(!calendar.includes('repairEventBandFallbackColors'),'legacy event fallback color repair must be removed');
assert.ok((calendar.match(/applyStoredCalendarColors\(/g)||[]).length>=3,'stored colors must be applied on definition, initial grid, and month replacement');

console.log('calendar-color-contract: ok');
