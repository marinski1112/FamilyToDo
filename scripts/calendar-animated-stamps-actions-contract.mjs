import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamp-actions.ts','utf8');
const adminInventory=fs.readFileSync('src/calendar-stamp-admin-inventory.ts','utf8');

for(const token of [
  'calendarStampAssetsForPicker',
  'registerCalendarStampAsset',
  'setCalendarStampAssetActive',
  'createCalendarStampPlacement',
  'updateCalendarStampPlacement',
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
  'UPDATE calendar_stamp_placements',
  'DELETE FROM calendar_stamp_placements',
  "new Date(ms).toISOString().slice(0,10)!==value",
  'normalizedVisibilityScope(input.visibilityScope)',
  "throw new Error('invalid calendar stamp visibility')",
]) assert.ok(source.includes(token),`calendar stamp action scaffolding missing: ${token}`);

assert.match(source,/SELECT id FROM members WHERE id=\? AND family_id=\? AND active=1 LIMIT 1/,'stamp reads and placement actions must require an active member in the same family');
assert.match(source,/calendarStampAssetsForPicker\(env:Env,familyId:number,memberId:number,limit=MAX_ASSET_OPTIONS\)[\s\S]*?assertPositiveId\(memberId,'calendar stamp member'\);[\s\S]*?await assertActiveMember\(env,familyId,memberId\);[\s\S]*?FROM calendar_stamp_assets[\s\S]*?WHERE family_id=\? AND active=1/,'asset picker must authorize the active acting member before same-family asset metadata is read');
assert.match(source,/SELECT id FROM members WHERE id=\? AND family_id=\? AND active=1 AND role IN \('OWNER','ADMIN'\) LIMIT 1/,'asset registry mutations must require an active same-family admin');
assert.match(source,/registerCalendarStampAsset[\s\S]*?INSERT INTO calendar_stamp_assets[\s\S]*?FROM members actor[\s\S]*?actor\.id=\? AND actor\.family_id=\? AND actor\.active=1 AND actor\.role IN \('OWNER','ADMIN'\)[\s\S]*?ON CONFLICT/,'asset registration mutation must atomically re-check active same-family admin authorization');
assert.match(source,/setCalendarStampAssetActive[\s\S]*?UPDATE calendar_stamp_assets SET active=\?,updated_at=\?[\s\S]*?EXISTS\(SELECT 1 FROM members actor WHERE actor\.id=\? AND actor\.family_id=\? AND actor\.active=1 AND actor\.role IN \('OWNER','ADMIN'\)\)/,'asset activation mutation must atomically re-check active same-family admin authorization');
assert.match(source,/SELECT \?,asset\.id,\?,\?,\?,\?,\?,\?,\?[\s\S]*WHERE asset\.id=\? AND asset\.family_id=\? AND asset\.active=1[\s\S]*?EXISTS\(SELECT 1 FROM members actor WHERE actor\.id=\? AND actor\.family_id=\? AND actor\.active=1\)/,'placement insert must atomically gate both active same-family asset and acting-member eligibility');
assert.match(source,/\.bind\(familyId,input\.stampDate,visibility,visibility==='PRIVATE'\?memberId:null,sortOrder,memberId,now,now,input\.assetId,familyId,memberId,familyId\)/,'placement insert must derive private ownership/creator from the acting member and bind its atomic membership guard');
assert.match(source,/function normalizedVisibilityScope\(value:unknown\):'FAMILY'\|'PRIVATE'\{[\s\S]*?value==='FAMILY'\|\|value==='PRIVATE'[\s\S]*?throw new Error\('invalid calendar stamp visibility'\)/,'runtime placement visibility must reject unknown values instead of falling back to FAMILY');
assert.match(source,/createCalendarStampPlacement[\s\S]*?const visibility=normalizedVisibilityScope\(input\.visibilityScope\)/,'placement creation must use strict runtime visibility validation');
assert.match(source,/updateCalendarStampPlacement[\s\S]*?const visibility=normalizedVisibilityScope\(input\.visibilityScope\)/,'placement updates must use strict runtime visibility validation');
assert.doesNotMatch(source,/input\.visibilityScope==='PRIVATE'\?'PRIVATE':'FAMILY'/,'placement actions must not silently publish malformed visibility values as FAMILY');
assert.match(source,/updateCalendarStampPlacement[\s\S]*?UPDATE calendar_stamp_placements[\s\S]*?SET stamp_date=\?,visibility_scope=\?,private_owner_id=\?,sort_order=\?,updated_at=\?[\s\S]*?WHERE id=\? AND family_id=\? AND created_by=\?[\s\S]*?EXISTS\(SELECT 1 FROM members actor WHERE actor\.id=\? AND actor\.family_id=\? AND actor\.active=1\)/,'placement update must remain creator-only and atomically re-check active same-family membership');
assert.match(source,/updateCalendarStampPlacement[\s\S]*?\.bind\(input\.stampDate,visibility,visibility==='PRIVATE'\?memberId:null,sortOrder,utcNow\(\),placementId,familyId,memberId,memberId,familyId\)/,'placement update must derive PRIVATE ownership from the acting creator and clear it for FAMILY visibility');
assert.doesNotMatch(source,/export type CalendarStampPlacementUpdateInput\s*=\s*\{[^}]*\bassetId\s*:/,'placement metadata updates must not permit asset identity replacement');
assert.match(source,/deleteCalendarStampPlacement[\s\S]*?DELETE FROM calendar_stamp_placements[\s\S]*?created_by=\?[\s\S]*?EXISTS\(SELECT 1 FROM members actor WHERE actor\.id=\? AND actor\.family_id=\? AND actor\.active=1\)/,'placement deletion must atomically re-check active same-family creator authorization');
assert.doesNotMatch(source,/SELECT id FROM calendar_stamp_assets WHERE id=\? AND family_id=\? AND active=1 LIMIT 1/,'placement creation must not split asset eligibility from insertion');
assert.match(source,/Math\.max\(1,Math\.min\(MAX_ASSET_OPTIONS/,'asset picker limit must remain runtime bounded');
assert.match(source,/lower\.startsWith\('data:'\)\|\|key\.includes\(':\/\/'\)/,'asset registry must reject embedded or remote URL storage keys');
assert.match(source,/slashNormalized\.startsWith\('\/\/'\)/,'asset registry must reject protocol-relative and backslash-equivalent remote keys');
assert.match(source,/segments\.some\(segment=>segment==='\.\.'\)/,'asset registry must reject parent traversal segments');
assert.match(source,/assetKind==='ANIMATED'&&mimeType==='image\/png'/,'animated PNG metadata must be rejected until the supported mime set includes an animation-safe PNG format');
assert.match(source,/\(width===null\)!==\(height===null\)/,'asset dimensions must be supplied as a pair');
assert.match(source,/UPDATE calendar_stamp_assets SET active=\?,updated_at=\?[\s\S]*?WHERE id=\? AND family_id=\?/,'asset activation changes must remain family-scoped soft mutations');
assert.doesNotMatch(source,/DELETE FROM calendar_stamp_assets/,'asset registry must not destructively delete assets while placements may reference them');
assert.doesNotMatch(source,/SELECT\s+\*/i,'stamp scaffolding must select only required asset/member fields');
assert.doesNotMatch(source,/console\.(?:log|warn|error)/,'stamp action contents must not be logged');
assert.doesNotMatch(source,/request|cookie|authorization|token|line_user_id|member_name|family_name/i,'stamp action domain must not handle session/token/identity content directly');
assert.doesNotMatch(source,/calendar\(|renderCalendarPage|calendar_perf/,'stamp action scaffolding must remain disconnected from the Calendar renderer while 1102 is being re-profiled');

for(const token of [
  'calendarStampAssetsForAdmin',
  'CalendarStampAdminCursor',
  'CALENDAR_STAMP_ACTION_LIMITS.maxAssetOptions',
  "role IN ('OWNER','ADMIN')",
  'FROM calendar_stamp_assets',
  'WHERE family_id=?',
  '? IS NULL OR active<? OR (active=? AND id>?)',
  'ORDER BY active DESC,id',
  'LIMIT ?',
]) assert.ok(adminInventory.includes(token),`calendar stamp admin inventory missing: ${token}`);
assert.match(adminInventory,/SELECT id,name,asset_kind,mime_type,storage_provider,storage_key,thumbnail_storage_key,width,height,active/,'admin inventory must select only bounded asset metadata');
assert.match(adminInventory,/Math\.max\(1,Math\.min\(max,/,'admin inventory limit must remain runtime bounded');
assert.match(adminInventory,/cursor\.active!==0&&cursor\.active!==1/,'admin inventory cursor must validate the active ordering component');
assert.match(adminInventory,/Number\.isSafeInteger\(cursor\.id\).*cursor\.id<=0/,'admin inventory cursor must validate the id ordering component');
assert.match(adminInventory,/\.bind\(familyId,cursorActive,cursorActive\?\?0,cursorActive\?\?0,cursor\?\.id\?\?0,boundedLimit\)/,'admin inventory must bind a stable keyset cursor and bounded page size');
assert.doesNotMatch(adminInventory,/\bOFFSET\b/i,'admin inventory must use keyset pagination rather than unbounded offset scans');
assert.doesNotMatch(adminInventory,/created_by|private_owner_id|visibility_scope|calendar_stamp_placements/,'admin inventory must not expose creator/private placement data');
assert.doesNotMatch(adminInventory,/SELECT\s+\*/i,'admin inventory must not use wildcard selects');
assert.doesNotMatch(adminInventory,/console\.(?:log|warn|error)|request|cookie|authorization|token|line_user_id|member_name|family_name/i,'admin inventory must not handle or log sensitive identity/session content');
assert.doesNotMatch(adminInventory,/calendar\(|renderCalendarPage|calendar_perf/,'admin inventory must remain disconnected from the Calendar renderer while 1102 is being re-profiled');

console.log('calendar animated stamps actions contract: bounded tenant-safe member-authorized picker, atomically authorized asset registry, paginated admin inventory and creator-owned placement mutations ok');
