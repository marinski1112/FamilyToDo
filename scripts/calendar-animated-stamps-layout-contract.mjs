import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamp-layout.ts','utf8');

for(const token of [
  'projectCalendarStampDayLayout',
  'primaryCalendarStampByDate',
  "const scheduleCapacity=hasStamp?1:2",
  'const visibleMultiDayBands=Math.min(multiDayBands,scheduleCapacity)',
  'const remainingCapacity=scheduleCapacity-visibleMultiDayBands',
  'const visibleScheduleRows=Math.min(scheduleRows,remainingCapacity)',
  'const overflowCount=(multiDayBands-visibleMultiDayBands)+(scheduleRows-visibleScheduleRows)',
  'visibleStampCount:hasStamp?1:0',
  'if(!out.has(placement.stamp_date))out.set(placement.stamp_date,placement)',
  'const MAX_COUNT=10000',
]) assert.ok(source.includes(token),`Calendar stamp layout projection missing: ${token}`);

assert.match(source,/function boundedCount\(value:number,label:string\):number\{[\s\S]*?Number\.isSafeInteger\(value\)[\s\S]*?value<0[\s\S]*?value>MAX_COUNT/,'layout counts must be bounded non-negative safe integers');
assert.match(source,/scheduleCapacity=hasStamp\?1:2/,'stamp presence must reserve one of the two month-cell content slots');
assert.match(source,/visibleMultiDayBands=Math\.min\(multiDayBands,scheduleCapacity\)[\s\S]*?remainingCapacity=scheduleCapacity-visibleMultiDayBands[\s\S]*?visibleScheduleRows=Math\.min\(scheduleRows,remainingCapacity\)/,'multi-day bands must consume capacity before ordinary schedule rows');
assert.match(source,/primaryCalendarStampByDate[\s\S]*?new Map<string,CalendarStampPlacement>\(\)[\s\S]*?if\(!out\.has\(placement\.stamp_date\)\)/,'thumbnail projection must retain only the first already-ordered stamp per date');
assert.doesNotMatch(source,/console\.(?:log|warn|error)|request|cookie|authorization|token|line_user_id|member_name|family_name|private_owner_id|created_by/i,'layout projection must not handle or log sensitive identity/session content');
assert.doesNotMatch(source,/env\.DB|prepare\(|fetch\(|calendar\(|renderCalendarPage|calendar_perf/,'layout projection must remain pure and disconnected from Calendar I/O/rendering while 1102 is trace-driven');

console.log('calendar animated stamps layout contract: bounded two-slot capacity, stamp reservation, multi-day priority and one-thumbnail-per-date projection ok');
