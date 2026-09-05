import fs from 'node:fs';

const api=fs.readFileSync('src/calendar-shared-stamp-api.ts','utf8');
const registry=fs.readFileSync('src/calendar-shared-stamp-registry.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

const requiredApi=[
  "if(request.method!=='GET')return json({ok:false,error:'GET_ONLY'},405);",
  "if(hasQuery(request))return json({ok:false,error:'INVALID_REQUEST'},400);",
  "role IN ('OWNER','ADMIN')",
  "if(!await activeAdmin(context.env,s.familyId,s.memberId))return json({ok:false,error:'ADMIN_REQUIRED'},403);",
  'const config=familySharedStampRegistryConfigFromEnv(context.env);',
  "if(!config)return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);",
  'client=createFamilySharedStampRegistryClient(config);',
  'const stamps=await client.list();',
  "return json({ok:true,serviceUrl:client.baseUrl,stamps},200,{'cache-control':'private, no-store'});",
  "return json({ok:false,error:'SHARED_STAMPS_UPSTREAM_FAILED'},502);",
];
for(const marker of requiredApi){
  if(!api.includes(marker))throw new Error(`shared stamp catalog API boundary missing: ${marker}`);
}

if(!api.includes('WHERE id=? AND family_id=? AND active=1'))throw new Error('shared stamp catalog admin check must remain same-family and active');
if(/\b(?:INSERT|UPDATE|DELETE)\b/u.test(api))throw new Error('shared stamp catalog read API must not write D1');
if(api.includes('SHARED_STAMPS_SERVICE_TOKEN')||api.includes('authorization'))throw new Error('shared stamp catalog API must not expose or manipulate service credentials directly');
if(api.includes('storageKey')||api.includes('objectKey'))throw new Error('shared stamp catalog API must not expose raw storage keys');

if(!registry.includes("async list():Promise<FamilySharedStampCatalogItem[]>{"))throw new Error('shared stamp registry public list client missing');
if(!registry.includes("fetchImpl(`${baseUrl}/v1/stamps`,{headers:{accept:'application/json'}})"))throw new Error('shared stamp public list must remain unauthenticated');
if(!registry.includes('const expectedContent=item.representation===\'SINGLE_FILE\'?`${prefix}/content`:null;'))throw new Error('shared stamp catalog content path must remain identity/version scoped');
if(!registry.includes('const expectedFrames=item.representation===\'FRAME_SEQUENCE\'?`${prefix}/frames`:null;'))throw new Error('shared stamp catalog frame path must remain identity/version scoped');
if(!registry.includes("if(item.thumbnailPath!==null&&item.thumbnailPath!==`${prefix}/thumbnail`)"))throw new Error('shared stamp thumbnail path must remain identity/version scoped');

if(!routes.includes("import { calendarSharedStampCatalogAdminApi } from './calendar-shared-stamp-api';"))throw new Error('shared stamp catalog route import missing');
if(!routes.includes("if(url.pathname==='/api/calendar-stamp-admin/shared-catalog') return await calendarSharedStampCatalogAdminApi(request,context);"))throw new Error('shared stamp catalog route dispatch missing');

console.log('calendar shared stamp catalog API contract: ok');
