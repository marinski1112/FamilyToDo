#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs'),tz=fs.readFileSync('src/timezone.ts','utf8'),imp=fs.readFileSync('src/family-log-import.ts','utf8'),ai=fs.readFileSync('src/family-ai.ts','utf8'),cal=fs.readFileSync('src/google-calendar.ts','utf8');
for(const x of ['parseImportDateTime','validateTimezone','timezoneOffsetMinutesAt'])if(!tz.includes(x))throw Error(x);
for(const x of ['repair_preview','repair_apply','repair_rollback','updated_at=created_at'])if(!imp.includes(x))throw Error(x);
if(ai.includes("datetime(occurred_at,'+9 hours')")||ai.includes("datetime(l.occurred_at,'+9 hours')"))throw Error('AI +9 remains');
if(cal.includes("+'+09:00'"))throw Error('calendar +09 remains');
JS
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for f in migrations/*.sql; do sqlite3 "$db" < "$f"; done
test "$(sqlite3 "$db" "SELECT dflt_value FROM pragma_table_info('families') WHERE name='timezone'")" = "'Asia/Tokyo'"
for t in member_permissions family_log_time_repairs; do test "$(sqlite3 "$db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='$t'")" = 1; done
# Execute timezone conversion examples through the compiled shared helper.
tmp="$(mktemp -d)"; npx tsc src/timezone.ts --outDir "$tmp" --module esnext --target es2022 --skipLibCheck
node --input-type=module - "$tmp/timezone.js" <<'JS'
const p=process.argv[2],{parseImportDateTime,addWallClockMinutes,validateTimezone}=await import('file://'+p);
const eq=(a,b)=>{if(a!==b)throw Error(`${a} != ${b}`)};
eq(parseImportDateTime('2026-03-04T02:05:00+09:00','Asia/Tokyo'),'2026-03-04 02:05:00');
eq(parseImportDateTime('2026-03-03T17:05:00Z','Asia/Tokyo'),'2026-03-04 02:05:00');
eq(parseImportDateTime('2026-03-04T02:05:00','Asia/Tokyo'),'2026-03-04 02:05:00');
eq(addWallClockMinutes('2026-03-03 17:05:00',540),'2026-03-04 02:05:00');
if(!validateTimezone('America/New_York')||validateTimezone('not/a-zone'))throw Error('validation');
JS
rm -rf "$tmp"
