import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const journal=read('src/family-daily-journal.ts');
const migration=read('migrations/0078_family_daily_journal.sql');
const routes=read('src/page-routes.ts');
const index=read('src/index.ts');
const shell=read('src/app-shell.ts');
const link=read('public/assets/family-journal-link.js');
const locationArchive=read('src/location-history-archive.ts');
const checks=[
  [migration.includes('CREATE TABLE IF NOT EXISTS family_daily_journals'),'daily journal table exists'],
  [migration.includes("storage_tier TEXT NOT NULL DEFAULT 'HOT'")&&migration.includes('archive_object_key')&&migration.includes('archived_at'),'journal is cold-archive ready'],
  [journal.includes('location_history_archive_days')&&journal.includes('location_history_stays'),'journal consumes durable Location projections'],
  [journal.includes('task_completion_history')&&journal.includes("visibility_scope='FAMILY'")&&journal.includes("lower(t.task_kind)<>'event'"),'journal includes only family-visible completed tasks'],
  [journal.includes("l.log_type='HOUSEWORK'")&&journal.includes('family_logs'),'journal includes canonical housework logs'],
  [journal.includes('REPAIR_DAYS=7')&&journal.includes('date>=todayJst()'),'only completed days are generated with bounded repair'],
  [journal.includes('ON CONFLICT(family_id,journal_date) DO UPDATE')&&journal.includes("storage_tier='HOT'"),'hot recent summaries can be refreshed without mutating cold archive'],
  [routes.includes("url.pathname==='/app/family_journal.php'")&&routes.includes('familyDailyJournalPage'),'family journal page is routed'],
  [index.includes('archiveLocationHistory(env).then(()=>generateFamilyDailyJournals(env))'),'daily journal runs after Location projection'],
  [shell.includes('/assets/family-journal-link.js')&&link.includes('/app/family_journal.php'),'Family Log exposes family journal'],
  [!locationArchive.includes('DELETE FROM member_location_history'),'journal generation does not force raw deletion'],
];
const failed=checks.filter(([ok])=>!ok).map(([,label])=>label);
if(failed.length){console.error('Family daily journal contract failed:\n- '+failed.join('\n- '));process.exit(1);}
console.log('Family daily journal contract OK');
