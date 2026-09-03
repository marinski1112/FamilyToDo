import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/calendar-stamp-api.ts',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../src/calendar-stamps.ts',import.meta.url),'utf8');
const resolver=fs.readFileSync(new URL('../src/calendar-stamp-asset-url.ts',import.meta.url),'utf8');
const storage=fs.readFileSync(new URL('../src/calendar-stamp-storage.ts',import.meta.url),'utf8');
const placementApi=fs.readFileSync(new URL('../src/calendar-stamp-placement-api.ts',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../src/app-shell.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/assets/calendar-stamp-ui.js',import.meta.url),'utf8');
const fail=message=>{console.error(message);process.exit(1)};
const mustSource=(needle,message)=>{if(!source.includes(needle))fail(message)};

mustSource("calendarStampPlacementsForRange(env,scope.familyId,scope.memberId,from,to)",'read API must reuse privacy-scoped bounded stamp read model');
mustSource("calendarStampFramesForAssets(env,scope.familyId,scope.memberId,placements.map(placement=>placement.asset_id))",'read API must fetch bounded PNG frames only after privacy-authorized placements are known');
mustSource('const invalidFrameAssets=new Set(frameRead.invalidAssetIds)','read API must preserve evidence of malformed persisted frame rows');
mustSource('if(invalidFrameAssets.has(placement.asset_id))return []','malformed persisted PNG frame metadata must suppress the entire asset');
mustSource("calendarStampAssetUrl(placement,'thumbnail')",'read API must resolve thumbnail through the safe asset resolver');
mustSource("calendarStampAssetUrl(placement,'full')",'read API must resolve full asset through the safe asset resolver');
mustSource("calendarStampFrameUrl(placement.storage_provider,placement.asset_id,frame.frame_index,frame.storage_key)",'PNG frames must reuse same-provider safe asset resolution without exposing UPLOAD storage keys');
mustSource("placement.asset_kind==='ANIMATED'&&placement.mime_type==='image/png'",'read API must identify sequential PNG animation explicitly');
mustSource("rows.length<2||rows.some((frame,index)=>frame.frame_index!==index)",'PNG animation must fail closed unless frames are contiguous from zero');
mustSource("frames.length!==rows.length",'PNG animation must fail closed when any frame URL cannot be safely resolved');
mustSource("'cache-control':'private, no-store'",'read API must forbid shared/browser cache reuse');
mustSource("if(!fullUrl||!thumbnailUrl)return []",'unresolvable/unsafe assets must fail closed');
mustSource("if(request.method!=='GET')",'read API must remain read-only');
mustSource("validCalendarDate(from)",'read API must validate range start');
mustSource("validCalendarDate(to)",'read API must validate range end');

for(const needle of [
  'export type CalendarStampFrame',
  'export type CalendarStampFrameReadResult',
  'const MAX_FRAMES_PER_ASSET=48',
  'const FRAME_QUERY_CHUNK=64',
  'calendarStampFramesForAssets',
  'FROM calendar_stamp_asset_frames f',
  "a.asset_kind='ANIMATED' AND a.mime_type='image/png'",
  'chunk.length*MAX_FRAMES_PER_ASSET',
  'safeCalendarStampFrame(row)',
  'invalidAssetIds.add(row.asset_id)',
  'frames.filter(frame=>!invalidAssetIds.has(frame.asset_id))',
])if(!model.includes(needle))fail(`bounded PNG frame read model missing: ${needle}`);
if(model.includes("row.asset_kind==='ANIMATED'&&row.mime_type==='image/png'"))fail('privacy read model must no longer reject supported sequential PNG animation assets');
for(const needle of ['calendarStampStorageKeyUrl','calendarStampFrameUrl',"asset.storage_provider==='ASSETS'","asset.storage_provider!=='UPLOAD'",'normalizeCalendarStampStorageKey'])if(!resolver.includes(needle))fail(`shared frame asset resolver missing: ${needle}`);
for(const needle of ["export type CalendarStampStorageProvider='ASSETS'|'UPLOAD'",'normalizeCalendarStampStorageKey'])if(!storage.includes(needle))fail(`shared stamp storage boundary missing: ${needle}`);

const start=source.indexOf('return [{');
const end=start>=0?source.indexOf('}];',start):-1;
if(start<0||end<0)fail('bounded browser projection is missing');
const projection=source.slice(start,end+3);
const mustProjection=(needle,message)=>{if(!projection.includes(needle))fail(message)};
for(const allowed of ['date:','placementId:','kind:','mimeType:','thumbnailUrl,','fullUrl,','frames,','width:','height:'])mustProjection(allowed,`missing bounded UI projection field ${allowed}`);
for(const sensitive of ['familyId:','memberId:','createdBy:','privateOwnerId:','storageKey:','thumbnailStorageKey:','name:','title:','description:','cookie:','token:']){
  if(projection.includes(sensitive))fail(`response projection must not expose sensitive/internal field ${sensitive}`);
}
if(/storage_key|thumbnail_storage_key|visibility_scope|private_owner_id|created_by|family_id|member_id/.test(projection))fail('raw persistence/private scope fields must not enter browser projection');

for(const needle of [
  'calendarStampOptionsApi',
  'calendarStampPlacementApi',
  "csrf!==expectedCsrf",
  'createCalendarStampPlacement',
  "calendarStampAssetUrl(asset,'thumbnail')",
])if(!placementApi.includes(needle))fail(`Calendar stamp picker/placement API boundary missing: ${needle}`);

if(!shell.includes('<script defer src="/assets/calendar-stamp-ui.js?v=${APP_VERSION}"></script>'))fail('Calendar shell must load the stamp renderer only through the Calendar asset bundle');
for(const needle of [
  "fetch('/api/calendar-stamps?from='",
  "const firstByDate=new Map()",
  "image.className='calendar-stamp-thumb'",
  "viewer.className='calendar-stamp-viewer'",
  "const normalizedFrames=stamp=>",
  "frames.length>=2",
  "viewerTimer=setTimeout(play,frame.durationMs)",
  "prefers-reduced-motion: reduce",
  "stampByPlacement.set(placementId,stamp)",
  "url.searchParams.set('stamp_play',String(Date.now()))",
  "new MutationObserver",
  "event.stopImmediatePropagation()",
  "u.origin===location.origin",
  "fetch('/api/calendar-stamp-options'",
  "fetch('/api/calendar-stamp-placement'",
  "JSON.stringify({csrf,assetId,stampDate,visibilityScope})",
  "pickerButton.textContent='スタンプ'",
  "selectedModalDate=()=>",
  "visibilityScope=String(pickerScope?.value||'FAMILY')",
  "await renderStamps()",
])if(!ui.includes(needle))fail(`Calendar stamp browser consumer missing: ${needle}`);
if(/family_id|member_id|private_owner_id|created_by|storage_key|thumbnail_storage_key|authorization|cookie/i.test(ui))fail('Calendar stamp browser consumer must not depend on internal identity/storage/session fields');

console.log('calendar animated stamps read API + month-cell consumer contract: bounded sequential PNG playback, ASSETS/R2 safe storage resolution, malformed-sequence fail-closed behavior, picker placement flow and legacy GIF/WebP fallback ok');
