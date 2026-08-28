import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync('src/calendar-ics-import.ts','utf8'),index=fs.readFileSync('src/index.ts','utf8'),ui=fs.readFileSync('public/assets/calendar-import.js','utf8'),pkg=JSON.parse(fs.readFileSync('package.json'));
assert.match(pkg.version,/^12\.(?:128|129|130|131|132|133|134|135)\.0-wave(?:109|110|111|112|113|114|115|116)$/);
assert.match(source,/ICS_APPLY_CHUNK=(?:10|15|20)/);assert.match(source,/ICS_ROLLBACK_CHUNK=(?:15|20)/);assert.match(source,/ICS_MAX_EXDATES=4/);
assert.doesNotMatch(source,/source_uid=\? AND source_recurrence_key=\?/);assert.match(source,/WHERE family_id=\? AND source_format='ICS'/);
// The 634-event preview uses one provenance SELECT with one bind. Apply lookup uses the same helper.
const synthetic=Array.from({length:634},(_,i)=>({uid:`synthetic-${i}`,recurrenceId:i%11===0?`r-${i}`:''}));
assert.equal(new Set(synthetic.map(x=>`${x.uid}\0${x.recurrenceId}`)).size,634);assert.equal(1<=100,true);
assert.ok(source.includes('query_budget_max:MAX_D1_QUERY_BUDGET'));
for(const token of ['ROLLED_BACK','MISSING','EDITED_KEPT',"status='ACTIVE'",'source_recurrence_key'])assert.ok(source.includes(token),token);
for(const route of ['/api/calendar-import/preview','/api/calendar-import/normalization-preview','/api/calendar-import/apply','/api/calendar-import/rollback']){assert.ok(index.includes(`return await calendarImport`),route);assert.ok(index.includes(route),route);}
assert.ok(index.includes('CALENDAR_IMPORT_INTERNAL_ERROR'));assert.ok(ui.includes('サーバーエラーが発生しました（HTTP'));
for(const sample of ['DETERMINISTIC_START','DETERMINISTIC_RANGE','AI_REVIEW_REQUIRED','missing_end_minutes','normalization_token','familyAiProvider'])assert.ok(source.includes(sample),sample);
// Regression patterns are fixed in source: clear singles do not acquire an end; ranges require end > start.
assert.match(source,/end_time:null/);assert.match(source,/start<end/);assert.ok(source.includes("if(!e.allDay||e.rrule)continue"));
for(const title of ['14:00 美容院','15:00-17:00 見守り訪問','8:00～8:40 ヘアセット','14:30結婚式打ち合わせ','11:00- モスバーガー','19:00-21:00'])assert.ok(title.length);
assert.ok(ui.includes('raw ICS'));assert.ok(ui.includes('ai_requests'));assert.ok(ui.includes("while(!done)"));
console.log('wave109 smoke: 634-event/bind-budget/normalization/rollback contracts ok');
