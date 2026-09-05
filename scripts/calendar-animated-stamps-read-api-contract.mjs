import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/calendar-stamp-api.ts',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../src/calendar-stamps.ts',import.meta.url),'utf8');
const resolver=fs.readFileSync(new URL('../src/calendar-stamp-asset-url.ts',import.meta.url),'utf8');
const storage=fs.readFileSync(new URL('../src/calendar-stamp-storage.ts',import.meta.url),'utf8');
const placementApi=fs.readFileSync(new URL('../src/calendar-stamp-placement-api.ts',import.meta.url),'utf8');
const actions=fs.readFileSync(new URL('../src/calendar-stamp-actions.ts',import.meta.url),'utf8');
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

for(const needle of ['export type CalendarStampFrame','export type CalendarStampFrameReadResult','const MAX_FRAMES_PER_ASSET=48','const FRAME_QUERY_CHUNK=64','calendarStampFramesForAssets','FROM calendar_stamp_asset_frames f',"a.asset_kind='ANIMATED' AND a.mime_type='image/png'",'chunk.length*MAX_FRAMES_PER_ASSET','safeCalendarStampFrame(row)','invalidAssetIds.add(row.asset_id)','frames.filter(frame=>!invalidAssetIds.has(frame.asset_id))'])if(!model.includes(needle))fail(`bounded PNG frame read model missing: ${needle}`);
if(model.includes("row.asset_kind==='ANIMATED'&&row.mime_type==='image/png'"))fail('privacy read model must no longer reject supported sequential PNG animation assets');
for(const needle of ['calendarStampStorageKeyUrl','calendarStampFrameUrl',"asset.storage_provider==='ASSETS'","asset.storage_provider!=='UPLOAD'",'normalizeCalendarStampStorageKey'])if(!resolver.includes(needle))fail(`shared frame asset resolver missing: ${needle}`);
for(const needle of ["export type CalendarStampStorageProvider='ASSETS'|'UPLOAD'",'normalizeCalendarStampStorageKey'])if(!storage.includes(needle))fail(`shared stamp storage boundary missing: ${needle}`);

const start=source.indexOf('return [{');
const end=start>=0?source.indexOf('}];',start):-1;
if(start<0||end<0)fail('bounded browser projection is missing');
const projection=source.slice(start,end+3);
const mustProjection=(needle,message)=>{if(!projection.includes(needle))fail(message)};
for(const allowed of ['date:','placementId:','visibilityScope:','sortOrder:','kind:','mimeType:','thumbnailUrl,','fullUrl,','frames,','width:','height:'])mustProjection(allowed,`missing bounded UI projection field ${allowed}`);
for(const sensitive of ['familyId:','memberId:','createdBy:','privateOwnerId:','storageKey:','thumbnailStorageKey:','name:','title:','description:','cookie:','token:'])if(projection.includes(sensitive))fail(`response projection must not expose sensitive/internal field ${sensitive}`);
if(/storage_key|thumbnail_storage_key|private_owner_id|created_by|family_id|member_id/.test(projection))fail('raw persistence/private scope fields must not enter browser projection');

for(const needle of ['calendarStampOptionsApi','calendarStampPlacementApi',"request.method!=='POST'&&request.method!=='DELETE'","request.method!=='PATCH'","csrf!==expectedCsrf",'createCalendarStampPlacement','updateCalendarStampPlacement','deleteCalendarStampPlacement',"calendarStampAssetUrl(asset,'thumbnail')","request.method==='PATCH'","request.method==='DELETE'","body.visibilityScope==null||body.sortOrder==null","json({ok:false,error:'PLACEMENT_NOT_FOUND'},404)"])if(!placementApi.includes(needle))fail(`Calendar stamp picker/placement API boundary missing: ${needle}`);
for(const needle of ['export async function updateCalendarStampPlacement','export async function deleteCalendarStampPlacement','WHERE id=? AND family_id=? AND created_by=?'])if(!actions.includes(needle))fail(`Calendar stamp creator-only placement mutation action missing: ${needle}`);

if(!shell.includes("const CALENDAR_STAMP_UI_REVISION = 'stamp-multi-placement-2';"))fail('Calendar stamp browser asset must carry an explicit revision when its UI changes without a global APP_VERSION release');
if(!shell.includes('<script defer src="/assets/calendar-stamp-ui.js?v=${APP_VERSION}-${CALENDAR_STAMP_UI_REVISION}"></script>'))fail('Calendar shell must load the versioned stamp renderer only through the Calendar asset bundle');
for(const needle of ["fetch('/api/calendar-stamps?from='","const MAX_VISIBLE_STAMPS_PER_DATE=3","const stampsByDate=new Map()","stampByPlacement.set(placementId,stamp)","stampsByDate.get(date)||[]","stamps.slice(0,MAX_VISIBLE_STAMPS_PER_DATE)","calendar-stamp-stack","calendar-stamp-overflow","image.className='calendar-stamp-thumb'","image.src=thumbnailUrl","viewer.className='calendar-stamp-viewer'","calendar-stamp-viewer-save","calendar-stamp-viewer-delete","const normalizedFrames=stamp=>","frames.length>=2","frames.forEach(frame=>{const preload=new Image();preload.src=frame.url;});","viewer.classList.add('open');play();","viewerTimer=setTimeout(play,frame.durationMs)","prefers-reduced-motion: reduce","viewerImage.src=fullUrl","background:transparent","viewer.focus({preventScroll:true})","target.closest('.calendar-stamp-viewer-edit,.calendar-stamp-viewer-actions')","new MutationObserver","event.stopImmediatePropagation()","u.origin===location.origin","fetch('/api/calendar-stamp-options'","fetch('/api/calendar-stamp-placement'","JSON.stringify({csrf,assetId,stampDate,visibilityScope})","method:'PATCH'","JSON.stringify({csrf,placementId,stampDate,visibilityScope,sortOrder})","method:'DELETE'","JSON.stringify({csrf,placementId})","pickerButton.textContent='スタンプ'","selectedModalDate=()=>","visibilityScope=String(pickerScope?.value||'FAMILY')","currentViewerStamp={...currentViewerStamp,date:stampDate,visibilityScope,sortOrder}","await renderStamps()"] )if(!ui.includes(needle))fail(`Calendar stamp browser consumer missing: ${needle}`);
for(const eager of ['preloadVisibleStamps','preloadStampMedia','requestIdleCallback','slice(0,6)'])if(ui.includes(eager))fail(`Calendar month-cell consumer must not eagerly preload animation media: ${eager}`);
if(ui.includes('firstByDate'))fail('Calendar month-cell consumer must not collapse same-day placements to only the first stamp');
if(ui.includes("url.searchParams.set('stamp_play',String(Date.now()))"))fail('Calendar stamp viewer must not force a unique media URL on every open because that defeats warm browser caching');
if(ui.includes('calendar-stamp-viewer-close'))fail('Calendar stamp viewer should close from the surrounding presentation surface rather than an explicit top-right close control');
if(/family_id|member_id|private_owner_id|created_by|storage_key|thumbnail_storage_key|authorization|cookie/i.test(ui))fail('Calendar stamp browser consumer must not depend on internal identity/storage/session fields');

console.log('calendar animated stamps read API + month-cell consumer contract: bounded same-day multi-stamp thumbnails, viewer-open-only sequential PNG frame preload/playback, safe storage resolution, lightweight tap-dismiss viewer, editable placement projection, picker/create/update/delete placement API flow and legacy GIF/WebP fallback ok');
