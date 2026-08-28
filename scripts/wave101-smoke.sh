#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs'),cal=fs.readFileSync('src/google-calendar.ts','utf8'),ai=fs.readFileSync('src/family-ai.ts','utf8'),pkg=require('../FamilyToDo/package.json');
const has=(s,x)=>{if(!s.includes(x))throw Error('missing '+x)};
if(!['12.120.0-wave101','12.121.0-wave102','12.122.0-wave103','12.123.0-wave104','12.124.0-wave105','12.125.0-wave106','12.126.0-wave107','12.127.0-wave108','12.128.0-wave109','12.129.0-wave110','12.130.0-wave111','12.131.0-wave112','12.132.0-wave113','12.133.0-wave114','12.134.0-wave115','12.135.0-wave116','12.136.0-wave117','12.136.1-wave117-hotfix','12.137.0-wave118'].includes(pkg.version))throw Error('version mismatch');
// Linked TASK/EVENT roundtrips update only the Calendar projection. Completion
// mode/status/assignees/completion rows and task_kind are absent from UPDATE.
const projection=cal.match(/UPDATE tasks SET title=\?,description=\?,start_at=\?,end_at=\?,due_at=\?,location=\?,all_day=\?,calendar_visible=1,updated_at=\?/);
if(!projection)throw Error('linked projection update missing');
if(/UPDATE tasks SET[^'\n]*task_kind/.test(cal))throw Error('linked task kind mutation');
for(const x of ["1,'EVENT'",'external_event_id=?','familyTodoTaskId','t.family_id=l.family_id','event.status===\'cancelled\'','calendar_visible=0','external_etag','syncLeases',"visibility_scope||'FAMILY'",'inboundEventTimes'])has(cal,x);
// Typed plans are enum-only, bounded, use aggregate HAVING, and keep results on Worker.
for(const x of ["'family_statistics'",'maxItems:3',"['QUERY','COMPARE']",'queries.length>3','comparison requires two queries','SQL is forbidden',' HAVING ','created_by','familyNow(timezone)','tok.question','statisticsAnswer','synthetic connectivity test','no user data is included'])has(ai,x);
for(const x of ['FAMILY_LOG','QUICK_CHORE','TASK','SCHEDULE','SUM_AMOUNT','AVG_DURATION','LATEST_AMOUNT','MEMBER','CHORE','MONTH','order_by','threshold'])has(ai,x);
if(/contents:\s*\[[\s\S]{0,300}(rows|result)/.test(ai))throw Error('raw results could reach Gemini');
console.log('wave101 smoke: calendar TASK/EVENT roundtrip, dedupe, privacy and typed statistics ok');
JS
