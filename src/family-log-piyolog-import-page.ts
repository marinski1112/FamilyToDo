import type {AppContext} from './app-context';
import {familyLogImportPage} from './family-log-import';

const CORE_IMPORT_ASSET='/assets/family-log-import.js?v=12.121.0-wave102';
const PIYOLOG_IMPORT_ASSET='/assets/family-log-import-piyolog.js?v=piyolog-media2';

/**
 * Keep the canonical preview/chunk/rollback importer and only replace its browser
 * controller with the Piyolog-capable controller. PDF parsing and AI conversion
 * intentionally stay outside FamilyToDo; this page accepts preconverted JSON and
 * optional pre-extracted private images.
 */
export async function familyLogPiyologImportPage(context:AppContext):Promise<Response>{
  const response=await familyLogImportPage(context);
  const source=await response.text();
  if(!source.includes(CORE_IMPORT_ASSET))return new Response(source,{status:response.status,headers:response.headers});
  const body=source.replace(CORE_IMPORT_ASSET,PIYOLOG_IMPORT_ASSET);
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
