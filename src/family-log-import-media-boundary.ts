import type {AppContext} from './app-context';
import {familyLogImportApi} from './family-log-import';
import {drainPendingFamilyLogMedia} from './family-log-media-api';

/**
 * Retained wrapper around the canonical Family Log importer.
 * Parent-field D1 triggers mark attachments for reconciliation, including rollback paths;
 * this boundary drains immediately actionable reconciliation work without reconstructing the importer itself.
 * Transient R2 failures remain in the durable cleanup queue for the next authenticated media/import request.
 */
export async function familyLogImportMediaBoundary(request:Request,context:AppContext):Promise<Response>{
  const response=await familyLogImportApi(request,context);
  const familyId=Number(context.member?.family_id||0);
  if(response.ok&&Number.isSafeInteger(familyId)&&familyId>0){
    await drainPendingFamilyLogMedia(context.env,familyId).catch(()=>{});
  }
  return response;
}
