import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/calendar-stamp-api.ts',import.meta.url),'utf8');
const fail=message=>{console.error(message);process.exit(1)};
const mustSource=(needle,message)=>{if(!source.includes(needle))fail(message)};

mustSource("calendarStampPlacementsForRange(env,scope.familyId,scope.memberId,from,to)",'read API must reuse privacy-scoped bounded stamp read model');
mustSource("calendarStampAssetUrl(placement,'thumbnail')",'read API must resolve thumbnail through the safe asset resolver');
mustSource("calendarStampAssetUrl(placement,'full')",'read API must resolve full asset through the safe asset resolver');
mustSource("'cache-control':'private, no-store'",'read API must forbid shared/browser cache reuse');
mustSource("if(!fullUrl||!thumbnailUrl)return []",'unresolved UPLOAD/unsafe assets must fail closed');
mustSource("if(request.method!=='GET')",'read API must remain read-only');
mustSource("validCalendarDate(from)",'read API must validate range start');
mustSource("validCalendarDate(to)",'read API must validate range end');

const start=source.indexOf('return [{');
const end=start>=0?source.indexOf('}];',start):-1;
if(start<0||end<0)fail('bounded browser projection is missing');
const projection=source.slice(start,end+3);
const mustProjection=(needle,message)=>{if(!projection.includes(needle))fail(message)};
for(const allowed of ['date:','placementId:','kind:','mimeType:','thumbnailUrl,','fullUrl,','width:','height:'])mustProjection(allowed,`missing bounded UI projection field ${allowed}`);
for(const sensitive of ['familyId:','memberId:','createdBy:','privateOwnerId:','storageKey:','thumbnailStorageKey:','name:','title:','description:','cookie:','token:']){
  if(projection.includes(sensitive))fail(`response projection must not expose sensitive/internal field ${sensitive}`);
}
if(/storage_key|thumbnail_storage_key|visibility_scope|private_owner_id|created_by|family_id|member_id/.test(projection))fail('raw persistence/private scope fields must not enter browser projection');

console.log('calendar animated stamps read API contract: ok');
