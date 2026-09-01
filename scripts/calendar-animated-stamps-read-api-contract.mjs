import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/calendar-stamp-api.ts',import.meta.url),'utf8');
const fail=message=>{console.error(message);process.exit(1)};
const must=(needle,message)=>{if(!source.includes(needle))fail(message)};
const mustNot=(needle,message)=>{if(source.includes(needle))fail(message)};

must("calendarStampPlacementsForRange(env,scope.familyId,scope.memberId,from,to)",'read API must reuse privacy-scoped bounded stamp read model');
must("calendarStampAssetUrl(placement,'thumbnail')",'read API must resolve thumbnail through the safe asset resolver');
must("calendarStampAssetUrl(placement,'full')",'read API must resolve full asset through the safe asset resolver');
must("'cache-control':'private, no-store'",'read API must forbid shared/browser cache reuse');
must("if(!fullUrl||!thumbnailUrl)return []",'unresolved UPLOAD/unsafe assets must fail closed');
must("if(request.method!=='GET')",'read API must remain read-only');
must("validCalendarDate(from)",'read API must validate range start');
must("validCalendarDate(to)",'read API must validate range end');

for(const sensitive of ['familyId:','memberId:','createdBy:','privateOwnerId:','storageKey:','thumbnailStorageKey:','name:','title:','description:','cookie:','token:']){
  mustNot(sensitive,`response projection must not expose sensitive/internal field ${sensitive}`);
}

const projection=source.slice(source.indexOf('return [{'),source.indexOf('}];',source.indexOf('return [{'))+3);
for(const allowed of ['date:','placementId:','kind:','mimeType:','thumbnailUrl,','fullUrl,','width:','height:'])must(allowed,`missing bounded UI projection field ${allowed}`);
if(/storage_key|thumbnail_storage_key|visibility_scope|private_owner_id|created_by|family_id|member_id/.test(projection))fail('raw persistence/private scope fields must not enter browser projection');

console.log('calendar animated stamps read API contract: ok');
