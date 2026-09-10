import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const archive=read('src/location-history-archive.ts');
const api=read('src/location-history-api.ts');
const ui=read('public/assets/location-history-ui.js');
const migration=read('migrations/0077_location_long_term_history.sql');
const index=read('src/index.ts');

const checks=[
  [archive.includes('RAW_RETENTION_SECONDS=24*60*60'),'raw retention is 24 hours'],
  [archive.includes('location_history_archive_days')&&archive.includes('location_history_stays'),'archive tables are used'],
  [archive.includes('Never delete a day whose archive failed')&&archive.includes('JOIN location_history_archive_days'),'raw deletion is archive-gated'],
  [archive.includes('MAX_ROUTE_POINTS=72')&&archive.includes('simplifyRoute'),'route is bounded and simplified'],
  [migration.includes('route_point_count <= 72'),'schema bounds simplified routes'],
  [api.includes("url.searchParams.get('date')")&&api.includes('readArchivedDay'),'one-day history supports long-term archive'],
  [api.includes('locationHistorySearchApi')&&api.includes('locationStayAddressApi'),'stay search/address persistence APIs exist'],
  [api.includes('sharing_enabled=1')&&api.includes('revoked_at IS NULL'),'archive reads preserve sharing/revoke gate'],
  [ui.includes("new URLSearchParams({memberId:String(memberId),date})"),'UI requests one day'],
  [ui.includes("history-search")&&ui.includes('いつ行った？'),'UI exposes stay search'],
  [ui.includes("setAttribute('hidden','')")&&!ui.includes('setDays(7)'),'multi-day picker is removed from active UI'],
  [index.includes('archiveAndCleanupLocationHistory(env)'),'hourly lifecycle schedules archive cleanup'],
];

const failed=checks.filter(([ok])=>!ok).map(([,label])=>label);
if(failed.length){console.error('Location long-term history contract failed:\n- '+failed.join('\n- '));process.exit(1);}
console.log('Location long-term history contract OK');
