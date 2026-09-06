import type {AppContext} from './app-context';
import {familyLogImportApi} from './family-log-import';
import {drainPendingFamilyLogMedia} from './family-log-media-api';

/**
 * Retained wrapper around the canonical Family Log importer.
 * Remote D1 migration 0057 intentionally avoids CREATE TRIGGER bodies for Wrangler compatibility,
 * so a successful import explicitly marks this family's existing media for revalidation before
 * draining immediately actionable cleanup work. Transient R2 failures remain in the durable queue.
 */
export async function familyLogImportMediaBoundary(request:Request,context:AppContext):Promise<Response>{
  const response=await familyLogImportApi(request,context);
  const familyId=Number(context.member?.family_id||0);
  if(response.ok&&Number.isSafeInteger(familyId)&&familyId>0){
    await context.env.DB.prepare('UPDATE family_log_media SET reconcile_pending=1 WHERE family_id=?').bind(familyId).run().catch(()=>{});
    await drainPendingFamilyLogMedia(context.env,familyId).catch(()=>{});
  }
  return response;
}
