import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamps.ts','utf8');

for(const token of [
  'safeStorageKey',
  'safeDimension',
  'safeCalendarStampPlacement',
  'const SCHEME_RE=/^[A-Za-z][A-Za-z0-9+.-]*:/;',
  "lower.startsWith('data:')",
  'SCHEME_RE.test(key)',
  "key.includes('://')",
  "slashNormalized.startsWith('//')",
  "segment==='..'",
  "row.asset_kind==='ANIMATED'&&row.mime_type==='image/png'",
  "row.storage_provider!=='ASSETS'&&row.storage_provider!=='UPLOAD'",
  'row.thumbnail_storage_key!==null&&!safeStorageKey(row.thumbnail_storage_key)',
  '(row.width===null)!==(row.height===null)',
  'stampDay>=fromDay&&stampDay<=toDay',
  'while(placements.length<MAX_ROWS)',
  "const cursorClause=cursorDate===null?'':",
  'if(safeCalendarStampPlacement(row,fromDay,toDay))placements.push(row)',
  'cursorDate=last.stamp_date',
  'cursorSort=last.sort_order',
  'cursorId=last.placement_id',
]) assert.ok(source.includes(token),`Calendar stamp read-model metadata guard missing: ${token}`);

assert.match(source,/const MAX_STORAGE_KEY_LENGTH=512/,'storage keys must remain bounded');
assert.match(source,/const MAX_DIMENSION=4096/,'renderer dimensions must remain bounded');
assert.match(source,/const MIN_SORT_ORDER=-1000[\s\S]*const MAX_SORT_ORDER=1000/,'sort order must remain bounded');
assert.match(source,/safeCalendarStampPlacement[\s\S]*?visibility_scope!=='FAMILY'[\s\S]*?visibility_scope!=='PRIVATE'/,'visibility scope must fail closed');
assert.match(source,/safeCalendarStampPlacement[\s\S]*?dayNumber\(row\.stamp_date\)[\s\S]*?stampDay>=fromDay&&stampDay<=toDay/,'returned stamp dates must be strict and stay inside the requested range');
assert.match(source,/while\(placements\.length<MAX_ROWS\)[\s\S]*LIMIT \?`\)[\s\S]*safeCalendarStampPlacement[\s\S]*rows\.results\.length<MAX_ROWS[\s\S]*cursorDate=last\.stamp_date/,'unsafe rows must not consume the final MAX_ROWS result limit');
assert.doesNotMatch(source,/rows\.results\.filter\(row=>safeCalendarStampPlacement/,'metadata filtering after a single bounded query must not hide later safe rows');
assert.doesNotMatch(source,/console\.(?:log|warn|error)/,'metadata guard must not log potentially sensitive or malformed row contents');
assert.doesNotMatch(source,/created_by|private_owner_id:\s*number|member_name|family_name/,'renderer-facing stamp type must not gain identity metadata');

console.log('calendar stamp read-model metadata guard contract: unsafe legacy renderer metadata fails closed without identity/log exposure or consuming the safe result limit');
