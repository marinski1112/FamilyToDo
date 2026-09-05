import fs from 'node:fs';

const publish=fs.readFileSync('src/calendar-shared-stamp-publish.ts','utf8');
const api=fs.readFileSync('src/calendar-shared-stamp-publish-api.ts','utf8');
const admin=fs.readFileSync('src/calendar-stamp-admin-api.ts','utf8');
const registry=fs.readFileSync('src/calendar-shared-stamp-registry.ts','utf8');
const ui=fs.readFileSync('public/assets/settings-stamps.js','utf8');
const page=fs.readFileSync('src/settings-content-page.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const workerTypes=fs.readFileSync('worker-configuration.d.ts','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');

for(const marker of [
  'export async function publishCalendarStampToShared(',
  "role IN ('OWNER','ADMIN')",
  'const existingRef=await calendarSharedStampRefForAsset(env,familyId,memberId,assetId);',
  "asset.asset_kind!=='ANIMATED'||asset.mime_type!=='image/png'||asset.storage_provider!=='UPLOAD'",
  'rows.length<MIN_FRAMES||rows.length>FAMILY_SHARED_STAMP_MAX_FRAMES',
  'durationMs<MIN_DURATION_MS||durationMs>MAX_DURATION_MS',
  'calendarStampManagedUploadObjectKey(familyId,storageKey)',
  'if(totalBytes>FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES)',
  'Math.max(width,height)>FAMILY_SHARED_STAMP_MAX_EDGE',
  "data[12]!==0x49||data[13]!==0x48||data[14]!==0x44||data[15]!==0x52",
  "SELECT id,name,asset_kind,mime_type,storage_provider,active",
  'const width=frames[0]!.width,height=frames[0]!.height;',
  "return `ft-${digest.slice(0,40)}`;",
  "representation:'FRAME_SEQUENCE'",
  "mimeType:'image/png'",
  'normalizedByteSize,',
  'new File([frame.bytes]',
  'await client.create(manifest,{frames:files});',
  'remote=await client.get(sharedStampId);',
  'await attachCalendarSharedStampRef(env,familyId,memberId,assetId,{',
]) if(!publish.includes(marker))throw new Error(`shared publish source boundary missing: ${marker}`);
if(/asset\.width|asset\.height/.test(publish))throw new Error('validated PNG IHDR dimensions must be authoritative over stale optional local display metadata');

const preflight=publish.indexOf('const existingRef=await calendarSharedStampRefForAsset');
const remoteCreate=publish.indexOf('await client.create(manifest,{frames:files});');
if(preflight<0||remoteCreate<0||preflight>remoteCreate)throw new Error('0054 projection preflight must occur before any shared remote write');
if(/familyId.*sharedStampId|memberId.*sharedStampId/.test(publish))throw new Error('shared id must not encode local family/member identity');

for(const marker of [
  "if(request.method!=='POST')return json({ok:false,error:'POST_ONLY'},405);",
  "if(new URL(request.url).search)return json({ok:false,error:'INVALID_REQUEST'},400);",
  "const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');",
  "if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);",
  'familySharedStampRegistryConfigFromEnv(context.env)',
  "if(!config)return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);",
  'publishCalendarStampToShared(context.env,s.familyId,s.memberId,assetId,client)',
  "error:'SHARED_STAMP_INCOMPATIBLE'",
  "error:'SHARED_STAMPS_UPSTREAM_FAILED'",
  'sharedPublished:true',
]) if(!api.includes(marker))throw new Error(`shared publish API boundary missing: ${marker}`);
if(/storageKey|thumbnailStorageKey|objectKey|SHARED_STAMPS_SERVICE_TOKEN|authorization/i.test(api))throw new Error('shared publish browser API must not expose or manipulate storage keys/service credentials');

for(const marker of [
  'async get(sharedId:string):Promise<FamilySharedStampCatalogItem|null>{',
  "if(response.status===404)return null;",
  "fetchImpl(`${baseUrl}/v1/stamps/${encodeURIComponent(sharedId)}`,{headers:{accept:'application/json'}})",
  "headers.set('authorization',`Bearer ${token}`)",
  "return write('/v1/stamps',{method:'POST',body:multipart(manifest,parts)});",
]) if(!registry.includes(marker))throw new Error(`shared registry client publish marker missing: ${marker}`);
const getStart=registry.indexOf('async get(sharedId:string)');
const getEnd=getStart>=0?registry.indexOf('publicUrl(path:string)',getStart):-1;
if(getStart<0||getEnd<0)throw new Error('shared registry get boundary missing');
if(/authorization|Bearer/.test(registry.slice(getStart,getEnd)))throw new Error('individual shared catalog GET must remain public/unauthenticated');

for(const marker of [
  'sharedPublishingReady:shared.ready',
  'sharedPublished,',
  'sharedPublishCandidate,',
  'canPublishShared:shared.ready&&!sharedPublished&&sharedPublishCandidate',
  "asset.storage_provider==='UPLOAD'",
  "if(storageProvider==='UPLOAD')",
  'await publishCalendarStampToShared(context.env,s.familyId,s.memberId,assetId,client);',
  'return json({ok:true,assetId,sharedPublished},201);',
]) if(!admin.includes(marker))throw new Error(`stamp admin shared publish projection missing: ${marker}`);
if(!admin.includes('catch{\n    // 0054 may not be deployed yet.'))throw new Error('local inventory must remain available before 0054 is deployed');

for(const marker of [
  'const MAX_UPLOAD_EDGE=384',
  'const MAX_SOURCE_BYTES=8*1024*1024',
  'const MAX_NORMALIZED_BYTES=1024*1024',
  'if(sourceBytes>MAX_SOURCE_BYTES)',
  'if(normalizedBytes>MAX_NORMALIZED_BYTES)',
  'const imageElementForFile=file=>',
  'return imageElementForFile(file);',
  'const prepareUploadFiles=async files=>',
  'Math.max(normalized.width,normalized.height)>MAX_UPLOAD_EDGE',
  "else if(normalized.width!==commonWidth||normalized.height!==commonHeight)",
  'return {files:prepared,width:commonWidth,height:commonHeight};',
  'preparedUpload=await prepareUploadFiles(files);width=preparedUpload.width;height=preparedUpload.height;',
  'uploadFrames(preparedUpload.files,token,durationMs)',
  "fetch('/api/calendar-stamp-admin/shared-publish'",
  "body:JSON.stringify({csrf:csrf(),assetId:Number(asset.id)})",
  "publish.textContent='みてにゃと共有'",
  "payload.sharedPublished===true",
]) if(!ui.includes(marker))throw new Error(`settings shared publish client marker missing: ${marker}`);
if(/typeof createImageBitmap[^\n]*return file|catch\s*\{\s*return file;\s*\}/.test(ui))throw new Error('unverifiable source dimensions must never silently bypass shared normalization');
if(/SHARED_STAMPS_SERVICE_TOKEN|Authorization:\s*Bearer|authorization|storage_key|thumbnail_storage_key|family_id|member_id|console\./i.test(ui))throw new Error('settings browser bundle must stay free of shared credentials/private persistence fields/logging');

for(const marker of [
  "const SETTINGS_STAMPS_UI_REVISION='shared-publish-1';",
  'settings-stamps.js?v=${APP_VERSION}-${SETTINGS_STAMPS_UI_REVISION}',
  'みてにゃでも利用できる共有スタンプとして公開します',
  '長辺384px以下',
  '全フレーム合計は1MiB以下',
]) if(!page.includes(marker))throw new Error(`shared publish settings page marker missing: ${marker}`);

if(!routes.includes("import { calendarSharedStampPublishAdminApi } from './calendar-shared-stamp-publish-api';"))throw new Error('shared publish route import missing');
if(!routes.includes("if(url.pathname==='/api/calendar-stamp-admin/shared-publish') return await calendarSharedStampPublishAdminApi(request,context);"))throw new Error('shared publish route dispatch missing');

for(const marker of ['SHARED_STAMPS_SERVICE_URL?:string','SHARED_STAMPS_SERVICE_TOKEN?:string'])if(!workerTypes.includes(marker))throw new Error(`shared service Env type missing: ${marker}`);
if(!wrangler.includes('"SHARED_STAMPS_SERVICE_URL": "https://family-shared-stamps.marinski1112.workers.dev"'))throw new Error('FamilyToDo shared service public URL config missing');
if(wrangler.includes('SHARED_STAMPS_SERVICE_TOKEN'))throw new Error('shared service token must remain a Worker secret, never plaintext wrangler config');

console.log('calendar shared stamp publish contract: admin/CSRF/tenant-safe private MEDIA source, verified 384px + 1MiB dimensions/bytes, deterministic privacy-safe identity, server-only Bearer write, idempotent 0054 projection, auto-publish + retry UI, and secret-free browser/config boundaries ok');