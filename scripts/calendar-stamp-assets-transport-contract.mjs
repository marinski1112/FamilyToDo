import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamp-asset-url.ts','utf8');

for(const token of [
  'calendarStampStorageKeyUrl',
  "storageProvider!=='ASSETS'",
  "variant==='thumbnail'&&placement.thumbnail_storage_key",
  'ASSET_PATH_RE.test(storageKey)',
  "storageKey.includes('..')",
  "storageKey.includes('//')",
  "return `/${normalized}`",
  'return calendarStampStorageKeyUrl(placement.storage_provider,key)',
]) assert.ok(source.includes(token),`Calendar stamp ASSETS transport missing: ${token}`);

assert.match(source,/UPLOAD is intentionally unresolved/,'UPLOAD/R2 must remain fail-closed until a concrete transport exists');
assert.doesNotMatch(source,/https?:\/\//i,'stamp transport must remain same-origin and must not embed remote URLs');
assert.doesNotMatch(source,/console\.|cookie|token|authorization|private_owner|family_id|member_id/i,'stamp asset URL resolution must not log or depend on sensitive/session/identity data');

console.log('calendar stamp ASSETS transport contract: full/thumbnail/frame same-origin ASSETS paths resolve conservatively; UPLOAD remains fail-closed');
