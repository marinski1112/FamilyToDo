import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamp-actions.ts','utf8');

for(const token of [
  'calendarStampAssetsForPicker',
  'registerCalendarStampAsset',
  'setCalendarStampAssetActive',
  'createCalendarStampPlacement',
  'deleteCalendarStampPlacement',
  'const MAX_ASSET_OPTIONS=64',
  'const MAX_ASSET_NAME_LENGTH=80',
  'const MAX_STORAGE_KEY_LENGTH=512',
  'WHERE family_id=? AND active=1',
  'LIMIT ?',
  'INSERT INTO calendar_stamp_assets',
  'ON CONFLICT(family_id,storage_provider,storage_key) DO UPDATE SET',
  'INSERT INTO calendar_stamp_placements',
  'FROM calendar_stamp_assets asset',
  'WHERE asset.id=? AND asset.family_id=? AND asset.active=1',
  "visibility==='PRIVATE'?memberId:null",
  "if(Number(result.meta.changes||0)!==1)throw new Error('calendar stamp asset unavailable')",
  'DELETE FROM calendar_stamp_placements WHERE id=? AND family_id=? AND created_by=?',
  "new Date(ms).toISOString().slice(0,10)!==value",
]) assert.ok(source.includes(token),`calendar stamp action scaffolding missing: ${token}`);

assert.match(source,/SELECT id FROM members WHERE id=\? AND family_id=\? AND active=1 LIMIT 1/,'placement actions must require an active member in the same family');
assert.match(source,/SELECT id FROM members WHERE id=\? AND family_id=\? AND active=1 AND role IN \('OWNER','ADMIN'\) LIMIT 1/,'asset registry mutations must require an active same-family admin');
assert.match(source,/SELECT \?,asset\.id,\?,\?,\?,\?,\?,\?,\?[\s\S]*WHERE asset\.id=\? AND asset\.family_id=\? AND asset\.active=1/,'placement insert must atomically gate insertion on an active same-family asset');
assert.match(source,/\.bind\(familyId,input\.stampDate,visibility,visibility==='PRIVATE'\?memberId:null,sortOrder,memberId,now,now,input\.assetId,familyId\)/,'placement insert must derive private ownership and creator from the acting member');
assert.doesNotMatch(source,/SELECT id FROM calendar_stamp_assets WHERE id=\? AND family_id=\? AND active=1 LIMIT 1/,'placement creation must not split asset eligibility from insertion');
assert.match(source,/Math\.max\(1,Math\.min\(MAX_ASSET_OPTIONS/,'asset picker limit must remain runtime bounded');
assert.match(source,/lower\.startsWith\('data:'\)\|\|key\.includes\(':\/\/'\)/,'asset registry must reject embedded or remote URL storage keys');
assert.match(source,/segments\.some\(segment=>segment==='\.\.'\)/,'asset registry must reject parent traversal segments');
assert.match(source,/assetKind==='ANIMATED'&&mimeType==='image\/png'/,'animated PNG metadata must be rejected until the supported mime set includes an animation-safe PNG format');
assert.match(source,/\(width===null\)!==\(height===null\)/,'asset dimensions must be supplied as a pair');
assert.match(source,/UPDATE calendar_stamp_assets SET active=\?,updated_at=\? WHERE id=\? AND family_id=\?/,'asset activation changes must remain family-scoped soft mutations');
assert.doesNotMatch(source,/DELETE FROM calendar_stamp_assets/,'asset registry must not destructively delete assets while placements may reference them');
assert.doesNotMatch(source,/SELECT\s+\*/i,'stamp scaffolding must select only required asset/member fields');
assert.doesNotMatch(source,/console\.(?:log|warn|error)/,'stamp action contents must not be logged');
assert.doesNotMatch(source,/request|cookie|authorization|token|line_user_id|member_name|family_name/i,'stamp action domain must not handle session/token/identity content directly');
assert.doesNotMatch(source,/calendar\(|renderCalendarPage|calendar_perf/,'stamp action scaffolding must remain disconnected from the Calendar renderer while 1102 is being re-profiled');

console.log('calendar animated stamps actions contract: bounded tenant-safe asset registry, picker and placement mutations ok');
