import fs from 'node:fs';

const api=fs.readFileSync('src/calendar-shared-stamp-api.ts','utf8');
const importer=fs.readFileSync('src/calendar-shared-stamp-import.ts','utf8');
const registry=fs.readFileSync('src/calendar-shared-stamp-registry.ts','utf8');
const media=fs.readFileSync('src/calendar-stamp-media-api.ts','utf8');
const ui=fs.readFileSync('public/assets/calendar-stamp-ui.js','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

const requiredApi=[
  "if(request.method!=='GET'&&request.method!=='POST')return json({ok:false,error:'GET_OR_POST_ONLY'},405);",
  "if(hasQuery(request))return json({ok:false,error:'INVALID_REQUEST'},400);",
  "role IN ('OWNER','ADMIN')",
  "if(!await activeAdmin(context.env,s.familyId,s.memberId))return json({ok:false,error:'ADMIN_REQUIRED'},403);",
  'const config=familySharedStampRegistryConfigFromEnv(context.env);',
  "if(!config)return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);",
  'client=createFamilySharedStampRegistryClient(config);',
  'const [stamps,localRefs]=await Promise.all([client.list(),localProjectionMap(context.env,s.familyId)]);',
  "const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');",
  "if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);",
  'const result=await materializeCalendarSharedStamp(',
];
for(const marker of requiredApi){
  if(!api.includes(marker))throw new Error(`shared stamp catalog API boundary missing: ${marker}`);
}
if(!api.includes('WHERE id=? AND family_id=? AND active=1'))throw new Error('shared stamp catalog admin check must remain same-family and active');
if(api.includes('SHARED_STAMPS_SERVICE_TOKEN')||api.includes('authorization'))throw new Error('shared stamp catalog API must not expose or manipulate service credentials directly');
if(api.includes('storageKey')||api.includes('objectKey'))throw new Error('shared stamp catalog browser DTO must not expose raw storage keys');

const requiredImporter=[
  "const LOCAL_SINGLE_FILE_MIME_TYPES=new Set<FamilySharedStampMimeType>(['image/png','image/webp','image/gif']);",
  'FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES',
  'FAMILY_SHARED_STAMP_MAX_FRAMES',
  'Math.max(width,height)>FAMILY_SHARED_STAMP_MAX_EDGE',
  "SELECT ref.asset_id,asset.active,ref.representation",
  'const catalog=await client.list();',
  'fetchImpl(client.publicUrl(item.contentPath)',
  'fetchImpl(client.publicUrl(item.framesPath)',
  'calendarStampManagedUploadObjectKey(familyId,storageKey)',
  "storageKey=`shared/${item.sharedId}/v${item.currentVersion}/content.${extension}`",
  "storageKey=`shared/${item.sharedId}/v${item.currentVersion}/frame-${String(frame.frameIndex).padStart(2,'0')}.png`",
  'registerCalendarStampAsset(env,familyId,memberId,{',
  'registerCalendarStampPngSequence(env,familyId,memberId,{',
  'attachCalendarSharedStampRef(env,familyId,memberId,assetId,{',
  "if(Number(existing.active)!==1)throw new Error('calendar shared stamp projection disabled');",
];
for(const marker of requiredImporter){
  if(!importer.includes(marker))throw new Error(`shared stamp materialization boundary missing: ${marker}`);
}
if(importer.includes('SHARED_STAMPS_SERVICE_TOKEN')||importer.includes('authorization'))throw new Error('shared stamp materializer must use public read URLs and never handle writer credentials');
if(importer.includes('image/jpeg\',\'image/png')||importer.includes("LOCAL_SINGLE_FILE_MIME_TYPES=new Set<FamilySharedStampMimeType>(['image/jpeg'"))throw new Error('FamilyToDo local asset CHECK does not allow JPEG and import must fail closed');

const requiredUi=[
  "fetch('/api/calendar-stamp-options'",
  "fetch('/api/calendar-stamp-admin/shared-catalog'",
  "method:'POST'",
  'body:JSON.stringify({csrf,sharedStampId,sharedVersion})',
  "button.dataset.source==='shared'?await materializeSharedOption(button):Number(button.dataset.assetId||0)",
  "fetch('/api/calendar-stamp-placement'",
  "if(u.origin!==base.origin||!u.pathname.startsWith('/v1/stamps/')||u.search||u.hash)return '';",
  "badge.textContent='共有'",
];
for(const marker of requiredUi){
  if(!ui.includes(marker))throw new Error(`shared stamp Calendar picker wiring missing: ${marker}`);
}
if(/SHARED_STAMPS_SERVICE_TOKEN|Authorization:\s*Bearer|authorization/i.test(ui))throw new Error('Calendar browser bundle must never receive shared writer credentials');

if(!shell.includes("const CALENDAR_STAMP_UI_REVISION = 'stamp-multi-placement-2';"))throw new Error('shared stamp picker change must rotate Calendar stamp UI cache revision');
if(!shell.includes('calendar-stamp-ui.js?v=${APP_VERSION}-${CALENDAR_STAMP_UI_REVISION}'))throw new Error('Calendar stamp UI must be served through the dedicated revisioned asset URL');

for(const mime of ["'image/png'|'image/gif'|'image/webp'","value==='image/png'||value==='image/gif'||value==='image/webp'"]){
  if(!media.includes(mime))throw new Error(`calendar private media proxy animated MIME support missing: ${mime}`);
}
if(!media.includes("asset.active=1 AND asset.storage_provider='UPLOAD'"))throw new Error('private media proxy must remain active family-local UPLOAD only');

if(!registry.includes("async list():Promise<FamilySharedStampCatalogItem[]>{"))throw new Error('shared stamp registry public list client missing');
if(!registry.includes("fetchImpl(`${baseUrl}/v1/stamps`,{headers:{accept:'application/json'}})"))throw new Error('shared stamp public list must remain unauthenticated');
if(!registry.includes("const expectedContent=item.representation==='SINGLE_FILE'?`${prefix}/content`:null;"))throw new Error('shared stamp catalog content path must remain identity/version scoped');
if(!registry.includes("const expectedFrames=item.representation==='FRAME_SEQUENCE'?`${prefix}/frames`:null;"))throw new Error('shared stamp catalog frame path must remain identity/version scoped');
if(!registry.includes("if(item.thumbnailPath!==null&&item.thumbnailPath!==`${prefix}/thumbnail`)"))throw new Error('shared stamp thumbnail path must remain identity/version scoped');

if(!routes.includes("import { calendarSharedStampCatalogAdminApi } from './calendar-shared-stamp-api';"))throw new Error('shared stamp catalog route import missing');
if(!routes.includes("if(url.pathname==='/api/calendar-stamp-admin/shared-catalog') return await calendarSharedStampCatalogAdminApi(request,context);"))throw new Error('shared stamp catalog route dispatch missing');
if(!String(pkg.scripts?.['check:browser-js']||'').includes('node --check public/assets/calendar-stamp-ui.js'))throw new Error('calendar-stamp-ui.js must be syntax checked in ordinary test');

await import('./calendar-shared-stamp-publish-contract.mjs');
console.log('calendar shared stamp catalog/import/picker contract: ok');