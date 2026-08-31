import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamp-actions.ts','utf8');

assert.match(source,/function normalizedActiveState\(value:unknown\):boolean\{[\s\S]*?value===true[\s\S]*?value===false[\s\S]*?throw new Error\('invalid calendar stamp active state'\)/,'asset active-state mutations must reject malformed runtime values');
assert.match(source,/setCalendarStampAssetActive[\s\S]*?const normalizedActive=normalizedActiveState\(active\);[\s\S]*?\.bind\(normalizedActive\?1:0,/,'asset active-state mutation must use strict normalized boolean input');
assert.doesNotMatch(source,/\.bind\(active\?1:0,/,'asset active-state mutation must not coerce arbitrary truthy runtime values');
assert.doesNotMatch(source,/console\.(?:log|warn|error)|request|cookie|authorization|token|line_user_id|member_name|family_name/i,'active-state guard must remain free of sensitive identity/session handling or logging');
assert.doesNotMatch(source,/calendar\(|renderCalendarPage|calendar_perf/,'active-state guard must remain disconnected from the Calendar renderer while 1102 is being re-profiled');

console.log('calendar animated stamps active-state contract: strict fail-closed runtime boolean handling ok');
