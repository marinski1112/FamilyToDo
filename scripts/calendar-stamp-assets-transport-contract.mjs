import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamp-asset-url.ts','utf8');
const storage=fs.readFileSync('src/calendar-stamp-storage.ts','utf8');
const sequence=fs.readFileSync('src/calendar-stamp-png-sequence-actions.ts','utf8');
const media=fs.readFileSync('src/calendar-stamp-media-api.ts','utf8');
const admin=fs.readFileSync('src/calendar-stamp-admin-api.ts','utf8');
const calendarApi=fs.readFileSync('src/calendar-stamp-api.ts','utf8');
const messageApi=fs.readFileSync('src/message-stamp-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const settings=fs.readFileSync('public/assets/settings-stamps.js','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const workerTypes=fs.readFileSync('worker-configuration.d.ts','utf8');

for(const token of [
  'calendarStampStorageKeyUrl',
  "asset.storage_provider==='ASSETS'",
  "variant==='thumbnail'&&asset.thumbnail_storage_key",
  'normalizeCalendarStampStorageKey(storageKey)',
  'const ASSET_PATH_RE=',
  'ASSET_PATH_RE.test(normalized)',
  "return `/${normalized}`",
  "return `/api/calendar-stamp-media?asset=${assetId}&variant=${variant}`",
  'calendarStampFrameUrl',
  "return `/api/calendar-stamp-media?asset=${assetId}&frame=${frameIndex}`",
]) assert.ok(source.includes(token),`Calendar stamp browser transport missing: ${token}`);

for(const token of [
  "export type CalendarStampStorageProvider='ASSETS'|'UPLOAD'",
  'normalizeCalendarStampStorageProvider',
  'normalizeCalendarStampStorageKey',
  'calendarStampManagedUploadObjectKey',
  "return `families/${familyId}/calendar-stamps/${key}`",
  "raw.replaceAll('\\\\','/').replace(/^\\/+/, '')",
]) assert.ok(storage.includes(token),`Calendar stamp managed storage seam missing: ${token}`);

assert.match(storage,/UPLOAD means app-managed media/,'UPLOAD must remain a logical provider independent of its R2 backing');
assert.match(storage,/future R2 binding can back UPLOAD without[\s\S]*rewriting Calendar stamp metadata or placements/,'R2 migration must not require a provider rewrite');
assert.match(storage,/lower\.startsWith\('data:'\)[\s\S]*ABSOLUTE_SCHEME_RE\.test\(raw\)[\s\S]*raw\.includes\(':\/\/'\)/,'managed storage keys must reject data/absolute/remote URLs');
assert.match(storage,/normalized\.includes\('\/\/'\)[\s\S]*segment==='\.\.'/,'managed storage keys must reject duplicate slashes and parent traversal');
assert.match(storage,/Number\.isSafeInteger\(familyId\).*familyId<=0/,'managed-upload object keys must require a positive family id');
assert.doesNotMatch(storage,/bucket[_-]?name|account[_-]?id|secret|signed[_-]?url/i,'storage boundary must not embed backend credentials or physical bucket identity');

assert.match(source,/ASSET_PATH_RE=\/\^\[A-Za-z0-9\._~\/-\]\+\$\//,'ASSETS URLs must retain a conservative URL-safe path allowlist');
assert.doesNotMatch(source,/https?:\/\//i,'stamp browser transport must remain same-origin and must not embed remote URLs');
assert.doesNotMatch(source,/console\.|cookie|token|authorization|private_owner|family_id|member_id/i,'stamp asset URL projection must not log or depend on sensitive/session/identity data');

for(const token of [
  'calendarStampMediaReadApi',
  'calendarStampMediaUploadApi',
  "role IN ('OWNER','ADMIN')",
  "request.headers.get('x-csrf-token')",
  "contentType!=='image/png'",
  'MAX_PNG_BYTES=4*1024*1024',
  'PNG_SIGNATURE',
  'crypto.randomUUID()',
  'calendarStampManagedUploadObjectKey(s.familyId,storageKey)',
  'context.env.MEDIA.put(objectKey,buffer',
  'context.env.MEDIA.get(objectKey)',
  "asset.storage_provider='UPLOAD'",
  "asset.active=1",
]) assert.ok(media.includes(token),`R2 stamp media transport missing: ${token}`);
assert.match(media,/frame\.family_id=\?[\s\S]*frame\.asset_id=\?[\s\S]*asset\.active=1[\s\S]*asset\.storage_provider='UPLOAD'/,'frame reads must be tenant-scoped and limited to active UPLOAD assets');
assert.match(media,/WHERE id=\? AND family_id=\? AND active=1 AND storage_provider='UPLOAD'/,'asset reads must be tenant-scoped and limited to active UPLOAD assets');
assert.doesNotMatch(media,/R2_ACCESS|ACCESS_KEY|SECRET_KEY|ACCOUNT_ID|https?:\/\//i,'R2 transport must use the Worker binding without embedded credentials or remote URLs');

for(const token of [
  'const MAX_UPLOAD_EDGE=512',
  'const MAX_UPLOAD_BYTES=4*1024*1024',
  "typeof createImageBitmap!=='function'",
  'bitmap=await createImageBitmap(file)',
  'if(longEdge<=MAX_UPLOAD_EDGE)return file',
  "canvas.getContext('2d',{alpha:true})",
  "canvas.toBlob(resolve,'image/png')",
  "return new File([blob],file.name,{type:'image/png',lastModified:file.lastModified})",
  'const uploadFile=await normalizeUploadFile(files[index])',
  'body:uploadFile',
]) assert.ok(settings.includes(token),`Stamp client upload normalization missing: ${token}`);
assert.match(settings,/for\(let index=0;index<files\.length;index\+\+\)[\s\S]*normalizeUploadFile\(files\[index\]\)[\s\S]*frames\.push/,'stamp frame normalization/upload must preserve selected frame order');
assert.match(settings,/catch\{\s*return file;\s*\}finally/,'stamp decode/re-encode failures must fall back to the already validated original PNG');
assert.doesNotMatch(settings,/image\/jpeg|image\/webp/,'stamp client normalization must preserve PNG/alpha transport semantics');

assert.match(admin,/body\.storageProvider==='UPLOAD'\?'UPLOAD':'ASSETS'/,'admin sequence registration must allow the R2-backed logical UPLOAD provider while preserving ASSETS');
assert.match(calendarApi,/calendarStampFrameUrl\(placement\.storage_provider,placement\.asset_id,frame\.frame_index,frame\.storage_key\)/,'Calendar read projection must route UPLOAD frames through the authenticated media endpoint');
assert.match(messageApi,/calendarStampFrameUrl\(row\.storage_provider,row\.asset_id,frame\.frame_index,frame\.storage_key\)/,'Message read projection must route UPLOAD frames through the authenticated media endpoint');
assert.match(routes,/\/api\/calendar-stamp-media/,'context API dispatcher must route authenticated stamp media reads');
assert.match(routes,/\/api\/calendar-stamp-admin\/upload/,'context API dispatcher must route admin stamp uploads');

assert.match(wrangler,/"r2_buckets"\s*:\s*\[/,'Worker config must provision an R2 binding');
assert.match(wrangler,/"binding"\s*:\s*"MEDIA"[\s\S]*"bucket_name"\s*:\s*"familytodo"/,'R2 MEDIA binding must target the user-provisioned familytodo bucket');
assert.match(workerTypes,/interface R2Bucket/,'Worker type surface must declare R2Bucket');
assert.match(workerTypes,/MEDIA:R2Bucket/,'Env must expose the MEDIA R2 binding');
assert.doesNotMatch(workerTypes,/R2_ACCESS|ACCESS_KEY|SECRET_KEY|ACCOUNT_ID/i,'R2 binding must not require persisted API credentials');

assert.match(sequence,/normalizeCalendarStampStorageProvider\(input\.storageProvider\)/,'PNG sequence registration must use the shared provider contract');
assert.match(sequence,/normalizeCalendarStampStorageKey\(frame\?\.storageKey/,'PNG frame registration must use shared backend-neutral key normalization');
assert.match(sequence,/normalizeCalendarStampStorageKey\(input\.thumbnailStorageKey/,'PNG thumbnail registration must use shared backend-neutral key normalization');
assert.doesNotMatch(sequence,/https?:\/\//i,'PNG sequence metadata registration must not embed remote URLs');
assert.doesNotMatch(sequence,/\benv\.[A-Za-z0-9_]*R2\b|\bR2Bucket\b/,'PNG sequence domain registration must not couple metadata to a physical R2 binding');

console.log('calendar stamp storage contract: ASSETS remains same-origin; UPLOAD is served through authenticated tenant-scoped MEDIA R2 transport with admin-only PNG upload, mobile-size client normalization, and backend-neutral metadata');