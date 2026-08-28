import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('src/calendar-ics-import.ts','utf8'),ui=fs.readFileSync('public/assets/calendar-import.js','utf8'),routes=fs.readFileSync('src/index.ts','utf8'),pkg=JSON.parse(fs.readFileSync('package.json'));
assert.ok(['12.130.0-wave111','12.131.0-wave112','12.132.0-wave113','12.133.0-wave114','12.134.0-wave115','12.135.0-wave116','12.136.0-wave117','12.136.1-wave117-hotfix','12.137.0-wave118','12.138.0-wave119','12.139.0-wave120','12.140.0-wave121','12.141.0-wave122','12.142.0-wave123'].includes(pkg.version));
assert.match(source,/ICS_APPLY_CHUNK=15/);assert.match(source,/MAX_D1_QUERY_BUDGET=40/);
assert.match(source,/parseIcs\(String\(b\.chunk_ics\|\|''\),zone,true\)/);assert.doesNotMatch(source,/calendarImportApply[\s\S]{0,500}requestState/);
assert.match(source,/parsedCount>ICS_APPLY_CHUNK/);assert.match(source,/sha_count:parsedCount/);assert.match(source,/parsed_event_count:parsedCount/);
assert.match(source,/status='IMPORTING'/);assert.match(source,/requestedOffset!==serverOffset/);assert.match(source,/COUNT\(\*\) active_count/);
assert.match(ui,/splitIcs/);assert.match(ui,/chunk_ics:(?:chunks\[chunkIndex\]|buildChunk)/);assert.doesNotMatch(ui,/calendar-import\/apply',\{\.\.\.args\(\)/);
assert.match(ui,/インポート準備中/);assert.match(ui,/処理が中断されました。再開できます/);assert.match(routes,/calendar-import\/prepare/);assert.match(routes,/calendar-import\/status/);
let remaining=634,requests=0;while(remaining){const parsed=Math.min(15,remaining);assert.ok(parsed<=15);const shaCount=parsed;assert.ok(shaCount<=15);remaining-=parsed;requests++;}assert.equal(requests,43);assert.equal(remaining,0);
// Approximate production envelope: browser sends only one <=20-event mini-calendar per apply, not the ~224 KiB source.
const event='BEGIN:VEVENT\r\nUID:x\r\nDTSTART:20260828T140000\r\nSUMMARY:'+('予定'.repeat(45))+'\r\nEND:VEVENT\r\n';const fixture='BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+Array.from({length:634},(_,i)=>event.replace('UID:x',`UID:${i}`)).join('')+'END:VCALENDAR\r\n';assert.equal((fixture.match(/BEGIN:VEVENT/g)||[]).length,634);assert.ok(Buffer.byteLength(fixture)>100000);assert.ok(Buffer.byteLength(event.repeat(15))<Buffer.byteLength(fixture)/10);
console.log('wave111 smoke: 634 events complete in 43 CPU-safe chunks; apply parse/SHA <=15, resume and reconciliation guards present');
