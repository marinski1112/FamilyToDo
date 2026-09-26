import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

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

// Exercise the exported scanner with more than one page. Existing archive
// markers keep the test focused on discovery, cursor progress and wrap-around.
const compiled=ts.transpileModule(archive,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const scope={exports:{},require:()=>({}),Date,Intl,console};
vm.runInNewContext(compiled,scope,{filename:'location-history-archive.js'});
let rows=Array.from({length:2050},(_,i)=>({id:i+1,family_id:1,member_id:1,recorded_at:'2026-09-01T12:00:00.000Z'}));
let cursor=0,failCursorWrite=false;
const db={prepare(sql){let args=[];return{bind(...values){args=values;return this;},
  async first(){
    if(sql.includes('location_history_archive_scan_state'))return {last_id:cursor};
    if(sql.includes('location_history_archive_days'))return {ok:1};
    throw Error(`Unexpected first: ${sql}`);
  },
  async all(){
    if(sql.includes('WHERE id>? ORDER BY id LIMIT ?'))return {results:rows.filter(row=>row.id>args[0]).slice(0,args[1])};
    if(sql.includes('WHERE recorded_at>=? AND recorded_at<? ORDER BY recorded_at LIMIT ?'))return {results:[]};
    throw Error(`Unexpected all: ${sql}`);
  },
  async run(){
    if(!sql.includes('UPDATE location_history_archive_scan_state'))throw Error(`Unexpected run: ${sql}`);
    if(failCursorWrite){failCursorWrite=false;throw Error('simulated cursor write failure');}
    cursor=args[0];return {meta:{changes:1}};
  },
};}};
const env={DB:db};
assert.equal((await scope.exports.archiveLocationHistory(env)).length,0);
assert.equal(cursor,2048,'the first run reads one bounded page');
failCursorWrite=true;
await assert.rejects(scope.exports.archiveLocationHistory(env),/simulated cursor write failure/);
assert.equal(cursor,2048,'a failed checkpoint leaves the page replayable');
await scope.exports.archiveLocationHistory(env);
assert.equal(cursor,2050,'the next run replays and finishes the page');
await scope.exports.archiveLocationHistory(env);
assert.equal(cursor,0,'the empty page wraps for missed or late rows');
await scope.exports.archiveLocationHistory(env);
assert.equal(cursor,2048,'the next cycle rechecks old rows');
rows=Array.from({length:20},(_,i)=>({id:i+1,family_id:i+1,member_id:1,recorded_at:'2026-09-01T12:00:00.000Z'}));
cursor=0;
await scope.exports.archiveLocationHistory(env);
assert.equal(cursor,16,'a page with more groups than the check budget resumes at the last inspected group');
await scope.exports.archiveLocationHistory(env);
assert.equal(cursor,20,'remaining groups are inspected on the next run');
assert.ok(archive.includes('recorded_at>=? AND recorded_at<?'),'daily reads use indexable UTC bounds');
const scanMigration=read('migrations/0107_location_archive_scan_cursor.sql');
assert.ok(scanMigration.includes('ON member_location_history(recorded_at, family_id, member_id)'));
console.log('Location long-term history contract OK');
