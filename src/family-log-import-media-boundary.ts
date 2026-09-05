import type {AppContext} from './app-context';
import {familyLogImportApi} from './family-log-import';
import {reconcilePendingFamilyLogMedia} from './family-log-media-api';

/**
 * Retained wrapper around the canonical Family Log importer.
 * Parent-field D1 triggers mark attachments for reconciliation, including rollback paths;
 * this boundary performs a bounded retry without reconstructing the importer itself.
 */
export async function familyLogImportMediaBoundary(request:Request,context:AppContext):Promise<Response>{
  const response=await familyLogImportApi(request,context);
  const familyId=Number(context.member?.family_id||0);
  if(response.ok&&Number.isSafeInteger(familyId)&&familyId>0){
    await reconcilePendingFamilyLogMedia(context.env,familyId,24).catch(()=>{});
  }
  return response;
}
