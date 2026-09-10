import assert from 'node:assert/strict';
import fs from 'node:fs';

const persistence=fs.readFileSync('src/location-persistence.ts','utf8');
const diagnostics=fs.readFileSync('src/location-quality-diagnostics-api.ts','utf8');

assert.match(persistence,/const GOOD_LATEST_ACCURACY_METERS=100;/);
assert.match(persistence,/const GOOD_LATEST_PROTECTION_SECONDS=30\*60;/);
assert.match(persistence,/INSERT INTO member_location_history/,'all authorized source fixes must continue to enter history');
assert.match(persistence,/member_location_latest\.accuracy_meters IS NULL/,'unknown existing quality must not pin latest');
assert.match(persistence,/member_location_latest\.accuracy_meters>\$\{GOOD_LATEST_ACCURACY_METERS\}/,'coarse existing latest must not be protected');
assert.match(persistence,/excluded\.accuracy_meters IS NOT NULL[\s\S]*excluded\.accuracy_meters<=\$\{GOOD_LATEST_ACCURACY_METERS\}/,'good incoming fix must replace normally');
assert.match(persistence,/unixepoch\(excluded\.recorded_at\)-unixepoch\(member_location_latest\.recorded_at\)>\$\{GOOD_LATEST_PROTECTION_SECONDS\}/,'coarse incoming fix must be admitted once protected latest is stale');
assert.match(persistence,/const results=await db\.batch\(\[history,latest,deviceSeen\]\)/,'history/latest/device state must retain the existing atomic batch boundary');
assert.doesNotMatch(persistence,/DELETE FROM member_location_history|accuracy_meters\s*<=\s*100[\s\S]*INSERT INTO member_location_history/,'quality gate must not discard poor history points');
assert.match(diagnostics,/latestSelection:'QUALITY_GUARDED_NEWEST_SENSOR_TIME'/);
assert.match(diagnostics,/qualityAware:true/);
assert.match(diagnostics,/goodLatestProtectionSeconds:1800/);
assert.match(diagnostics,/historyKeepsPoorPoints:true/);

console.log('location-quality-aware-latest-contract: coarse transient fixes cannot displace a recent <=100m latest, history remains complete, and stale fallback remains available');
