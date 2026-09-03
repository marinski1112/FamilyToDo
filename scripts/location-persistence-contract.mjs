import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/location-persistence.ts',import.meta.url),'utf8');
const migration=await readFile(new URL('../migrations/0052_location_persistence_foundation.sql',import.meta.url),'utf8');

assert.match(source,/point\.familyId===device\.familyId/,'persistence must bind point family to authenticated device');
assert.match(source,/point\.memberId===device\.memberId/,'persistence must bind point member to authenticated device');
assert.match(source,/point\.provider===device\.provider/,'persistence must bind point provider to authenticated device');
assert.match(source,/point\.deviceId===device\.publicId/,'persistence must bind point public device id to authenticated credential');
assert.match(source,/crypto\.subtle\.digest\('SHA-256'/,'normalized points must receive a one-way replay key');
assert.match(source,/INSERT INTO member_location_history/,'normalized points must persist bounded history');
assert.match(source,/ON CONFLICT\(device_id,dedupe_key\) DO NOTHING/,'history replay must be deduplicated');
assert.match(source,/INSERT INTO member_location_latest/,'normalized points must update latest state');
assert.match(source,/excluded\.recorded_at>member_location_latest\.recorded_at/,'older points must not replace newer latest state');
assert.match(source,/excluded\.received_at>member_location_latest\.received_at/,'same-time latest replacement must use receipt time ordering');
assert.match(source,/d\.enabled=1 AND d\.sharing_enabled=1 AND d\.revoked_at IS NULL/,'every persistence path must retain fail-closed device-state guards');
assert.match(source,/m\.id=d\.member_id AND m\.family_id=d\.family_id AND m\.active=1/,'history/latest writes must re-check active same-family member binding');
assert.match(source,/EXISTS \([\s\S]*m\.id=location_devices\.member_id[\s\S]*m\.family_id=location_devices\.family_id[\s\S]*m\.active=1/,'last-seen mutation must re-check active same-family member binding');
assert.match(source,/const results=await db\.batch\(\[history,latest,deviceSeen\]\)/,'history/latest/device heartbeat must use one D1 batch');
assert.match(source,/results\[2\]\?\.meta\?\.changes/,'persistence acceptance must depend on the guarded device mutation result');
assert.match(source,/authorizedChanges>0/,'revoked/share-off/inactive mutation races must fail closed');
assert.doesNotMatch(source,/console\.(?:log|info|warn|error)/,'Location persistence must not log coordinates or credential-adjacent data');
assert.doesNotMatch(source,/Authorization|raw_payload|request\.url|searchParams/i,'Location persistence must not depend on request credentials or raw payloads');

for(const table of ['location_devices','member_location_latest','member_location_history']){
  assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} must remain backed by additive migration 0052`);
}
assert.match(migration,/UNIQUE \(device_id, dedupe_key\)/,'history schema must retain replay uniqueness');

console.log('location-persistence-contract: ok');
