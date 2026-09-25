import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const archive=read('src/location-history-archive.ts');
const api=read('src/location-history-api.ts');
const ui=read('public/assets/location-history-ui.js');
const migration=read('migrations/0077_location_long_term_history.sql');
const index=read('src/index.ts');

const checks=[
  [archive.includes('location_history_archive_days')&&archive.includes('location_history_stays'),'archive tables are used'],
  [!archive.includes('DELETE FROM member_location_history')&&!archive.includes('RAW_RETENTION_SECONDS'),'hourly archive never deletes raw history'],
  [archive.includes('explicit')&&archive.includes('data-maintenance'),'raw cleanup is reserved for explicit maintenance'],
  [archive.includes('MAX_ROUTE_POINTS=72')&&archive.includes('simplifyRoute'),'route is bounded and simplified'],
  [archive.includes('MAX_MINUTE_POINTS_PER_DAY=1440')&&archive.includes('ROW_NUMBER() OVER')&&archive.includes('minute_rank=1'),'dense raw days are minute-sampled before archive projection'],
  [archive.includes('COUNT(*) AS raw_point_count')&&archive.includes('rawPointCount'),'archive preserves the true raw point count while using bounded minute samples'],
  [!archive.includes('HAVING COUNT(*)<=?'),'dense Overland days are not excluded from archive/search projection'],
  [migration.includes('route_point_count <= 72'),'schema bounds simplified routes'],
  [api.includes("url.searchParams.get('date')")&&api.includes('readArchivedDay'),'one-day history supports long-term archive'],
  [api.includes('HISTORY_CANDIDATE_LIMIT=1440')&&api.includes('HISTORY_DISPLAY_LIMIT=500'),'live one-day history reads 1440 candidates but keeps the browser projection bounded'],
  [api.includes('STATIONARY_SAMPLE_MS=10*60*1000')&&api.includes('MOVEMENT_SAMPLE_METERS=30')&&api.includes('simplifyHistoryForDisplay(points)'),'live history collapses stationary chatter while preserving movement candidates'],
  [api.includes('rawPointCount:points.length')&&api.includes('displayLimit:HISTORY_DISPLAY_LIMIT'),'live response exposes candidate/display counts without raw payload logging'],
  [api.includes('locationHistorySearchApi')&&api.includes('locationStayAddressApi'),'stay search/address persistence APIs exist'],
  [api.includes('sharing_enabled=1')&&api.includes('revoked_at IS NULL'),'archive reads preserve sharing/revoke gate'],
  [api.includes('d.member_id=location_history_stays.member_id')&&api.includes('d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL'),'archived stay address writes preserve current sharing/revoke gate'],
  [ui.includes("new URLSearchParams({memberId:String(memberId),date})"),'UI requests one day'],
  [ui.includes("history-search")&&ui.includes('いつ行った？'),'UI exposes stay search'],
  [index.includes('archiveLocationHistory(env)'),'hourly lifecycle schedules archive projection'],
];

const failed=checks.filter(([ok])=>!ok).map(([,label])=>label);
if(failed.length){console.error('Location long-term history contract failed:\n- '+failed.join('\n- '));process.exit(1);}
console.log('Location long-term history contract OK');
