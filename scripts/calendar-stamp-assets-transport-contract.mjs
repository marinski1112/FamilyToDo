import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamp-asset-url.ts','utf8');
const storage=fs.readFileSync('src/calendar-stamp-storage.ts','utf8');
const sequence=fs.readFileSync('src/calendar-stamp-png-sequence-actions.ts','utf8');

for(const token of [
  'calendarStampStorageKeyUrl',
  "storageProvider!=='ASSETS'",
  "variant==='thumbnail'&&placement.thumbnail_storage_key",
  'normalizeCalendarStampStorageKey(storageKey)',
  "return `/${normalized}`",
  'return calendarStampStorageKeyUrl(placement.storage_provider,key)',
]) assert.ok(source.includes(token),`Calendar stamp ASSETS transport missing: ${token}`);

for(const token of [
  "export type CalendarStampStorageProvider='ASSETS'|'UPLOAD'",
  'normalizeCalendarStampStorageProvider',
  'normalizeCalendarStampStorageKey',
  'calendarStampManagedUploadObjectKey',
  "return `families/${familyId}/calendar-stamps/${key}`",
  "raw.replaceAll('\\\\','/').replace(/^\\/+/, '')",
]) assert.ok(storage.includes(token),`Calendar stamp managed storage seam missing: ${token}`);

assert.match(storage,/UPLOAD means app-managed media/,'UPLOAD must remain a logical provider independent of its future R2 backing');
assert.match(storage,/future R2 binding can back UPLOAD without[\s\S]*rewriting Calendar stamp metadata or placements/,'R2 migration must not require a provider rewrite');
assert.match(storage,/lower\.startsWith\('data:'\)[\s\S]*ABSOLUTE_SCHEME_RE\.test\(raw\)[\s\S]*raw\.includes\(':\/\/'\)/,'managed storage keys must reject data/absolute/remote URLs');
assert.match(storage,/normalized\.includes\('\/\/'\)[\s\S]*segment==='\.\.'/,'managed storage keys must reject duplicate slashes and parent traversal');
assert.match(storage,/Number\.isSafeInteger\(familyId\).*familyId<=0/,'future managed-upload object keys must require a positive family id');
assert.doesNotMatch(storage,/bucket[_-]?name|account[_-]?id|secret|signed[_-]?url/i,'storage boundary must not embed backend credentials or physical bucket identity');

assert.match(source,/UPLOAD is the migration-stable logical provider/,'UPLOAD/R2 must remain fail-closed until a concrete transport exists');
assert.match(source,/intentionally unresolved until a concrete authenticated upload\/R2 transport and[\s\S]*binding exist/,'asset resolver must not pretend R2 exists before a binding is configured');
assert.doesNotMatch(source,/https?:\/\//i,'stamp transport must remain same-origin and must not embed remote URLs');
assert.doesNotMatch(source,/console\.|cookie|token|authorization|private_owner|family_id|member_id/i,'stamp asset URL resolution must not log or depend on sensitive/session/identity data');

assert.match(sequence,/normalizeCalendarStampStorageProvider\(input\.storageProvider\)/,'PNG sequence registration must use the shared provider contract');
assert.match(sequence,/normalizeCalendarStampStorageKey\(frame\?\.storageKey/,'PNG frame registration must use shared backend-neutral key normalization');
assert.match(sequence,/normalizeCalendarStampStorageKey\(input\.thumbnailStorageKey/,'PNG thumbnail registration must use shared backend-neutral key normalization');
assert.doesNotMatch(sequence,/bucket|https?:\/\//i,'PNG sequence metadata registration must remain physical-storage agnostic');

console.log('calendar stamp storage contract: ASSETS stays same-origin; UPLOAD stays fail-closed and backend-neutral with a tenant-safe future R2 object-key seam');
