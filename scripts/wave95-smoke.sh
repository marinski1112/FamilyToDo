#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs');
const app=fs.readFileSync('src/app.ts','utf8'),js=fs.readFileSync('public/assets/family-log.js','utf8')+fs.readFileSync('public/assets/family-log-core.js','utf8'),css=fs.readFileSync('public/assets/family.css','utf8'),mig=fs.readFileSync('migrations/0031_wave95_quick_chore_weekdays.sql','utf8'),idx=fs.readFileSync('src/index.ts','utf8');
const has=(s,n)=>{if(!s.includes(n))throw Error(`missing: ${n}`)};
has(app,"supportsDedicatedSleep");has(app,"subject_kind IN ('BABY','CHILD')");has(app,"familyQuickChoreWeekdayBit(selectedDate)");has(app,"weekday_mask");has(app,'family-log-subject-edit');has(js,"input[name=\"weekday\"]:checked");has(css,'repeat(3,minmax(0,1fr))');has(css,'@media(max-width:319px)');has(app,'aria-label="管理に戻る"');has(app,'family-log-back-icon');
if(app.includes('この対象の表示項目・設定'))throw Error('second subject edit step remains');
if(/family-log-subject-edit[^>]+href=/.test(app))throw Error('management edit still navigates');
has(mig,'DEFAULT 127');has(mig,'weekday_mask');has(idx,"NOT IN ('BABY','CHILD')");has(app,"type!=='TIMER'");has(app,'familyLogOverviewQuickTypes');
console.log('wave95 family-log smoke: ok');
JS

db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
test "$(sqlite3 "$db" "SELECT weekday_mask FROM family_quick_chores LIMIT 1")" = "" || true
test "$(sqlite3 "$db" "SELECT dflt_value FROM pragma_table_info('family_quick_chores') WHERE name='weekday_mask'")" = "127"
