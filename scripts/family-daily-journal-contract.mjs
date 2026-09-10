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
  [migration.includes('idx_family_daily_journals_family_date')&&migration.includes('family_id, journal_date DESC'),'journal has family/date index for bounded reads'],
  [journal.includes('location_history_archive_days')&&journal.includes('location_history_stays'),'journal consumes durable Location projections'],
  [journal.includes('readSharedLocationMemberIds')&&journal.includes('d.enabled=1')&&journal.includes('d.sharing_enabled=1')&&journal.includes('d.revoked_at IS NULL')&&journal.includes('m.active=1'),'journal has a current active sharing/revoke gate'],
  [journal.includes('a.local_date=? AND EXISTS (SELECT 1 FROM location_devices d')&&journal.includes('s.local_date=? AND EXISTS (SELECT 1 FROM members m JOIN location_devices d'),'new Location journal evidence is gated by current sharing state'],
  [journal.includes('.filter(member=>sharedLocationMembers.has(member.memberId))'),'persisted Location journal evidence is filtered by current sharing state at read time'],
  [journal.includes('calendar(month,byDate,selectedDate,sharedLocationMembers)')&&journal.includes('function calendar(month:string,rows:Map<string,Row>,selected:string,sharedLocationMembers:Set<number>)'),'calendar Location counts respect current sharing state'],
  [journal.includes('safeSelectedSummary=selected?summary(location,tasks,housework)')&&!journal.includes('esc(selected.summary_text)'),'selected journal summary is recomputed from currently visible evidence'],
  [journal.includes('MAX_SEARCH_YEAR_ROWS=366')&&journal.includes('journal_date>=? AND journal_date<?')&&journal.includes('searchFrom,searchTo,MAX_SEARCH_YEAR_ROWS'),'free-text search reads at most one indexed calendar year'],
  [journal.includes('safe_summary:summary(location,tasks,housework)')&&journal.includes('.filter(row=>String(row.safe_summary).toLocaleLowerCase().includes(normalizedQuery))'),'search matches a recomputed privacy-filtered summary'],
  [!journal.includes('summary_text LIKE ?'),'search cannot match stale persisted Location summary text'],
  [journal.includes('task_completion_history')&&journal.includes("visibility_scope='FAMILY'")&&journal.includes("lower(t.task_kind)<>'event'"),'journal includes only family-visible completed tasks'],
  [journal.includes("l.log_type='HOUSEWORK'")&&journal.includes('family_logs'),'journal includes canonical housework logs'],
  [journal.includes('REPAIR_DAYS=7')&&journal.includes('date>=todayJst()'),'only completed days are generated with bounded repair'],
  [journal.includes('JOURNAL_REFRESH_MS=24*60*60*1000')&&journal.includes("SELECT journal_date,generated_at FROM family_daily_journals WHERE family_id=? AND storage_tier='HOT'")&&journal.includes('freshDates.has(date)'),'scheduled repair skips fresh HOT journal rows while retaining the seven-day repair window'],
  [journal.includes('ON CONFLICT(family_id,journal_date) DO UPDATE')&&journal.includes("storage_tier='HOT'"),'hot recent summaries can be refreshed without mutating cold archive'],
  [journal.includes('MAX_SUMMARY_DETAILS=3')&&journal.includes('MAX_SUMMARY_DETAIL_CHARS=60')&&journal.includes('summaryDetails(stays.map(stay=>stay.place))')&&journal.includes('summaryDetails(tasks.map(task=>task.title))')&&journal.includes('summaryDetails(housework.map(item=>item.name))'),'deterministic summary exposes bounded semantic evidence for search'],
  [journal.includes("url.searchParams.get('search_year')")&&journal.includes('name="search_year"')&&journal.includes('検索は指定した1年単位'),'journal UI exposes the bounded search year'],
  [journal.includes('placeholder="場所・タスク・家事などで検索"'),'journal search copy matches searchable deterministic evidence'],
  [routes.includes("url.pathname==='/app/family_journal.php'")&&routes.includes('familyDailyJournalPage'),'family journal page is routed'],
  [index.includes('archiveLocationHistory(env).then(()=>generateFamilyDailyJournals(env))'),'daily journal runs after Location projection'],
  [shell.includes('/assets/family-journal-link.js')&&link.includes('/app/family_journal.php'),'Family Log exposes family journal'],
  [!locationArchive.includes('DELETE FROM member_location_history'),'journal generation does not force raw deletion'],
];
const failed=checks.filter(([ok])=>!ok).map(([,label])=>label);
if(failed.length){console.error('Family daily journal contract failed:\n- '+failed.join('\n- '));process.exit(1);}
console.log('Family daily journal contract OK');