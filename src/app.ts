import type { AppContext } from './app-context';

export type { AppContext } from './app-context';
export { makeContext, memberById } from './app-context';
export { AuthRequired, BadRequest, Forbidden } from './errors';
export { layout } from './app-shell';
export { logActivity } from './activity-log';
export { taskVisibilitySql, taskChildVisibilitySql, canAccessTask, activityLogVisibilitySql } from './task-visibility';
export {
  createExternalShoppingItemDomain,
  normalizeMilkAmountPresets,
  recordConfiguredQuickActionDomain,
  recordExternalFamilyLogDomain,
  recordExternalPetQuickLogDomain,
  recordGoogleVoiceFamilyLogDomain,
  recordQuickChoreDomain,
  resolveGoogleVoiceInquiryLines,
  startDedicatedSleepDomain,
  stopDedicatedSleepDomain,
  supportsDedicatedSleep,
} from './family-external-domain';

/** Temporary compatibility entry for callers that historically reached the Family Log page through app.ts. */
export async function familyLog(request:Request,ctx:AppContext):Promise<Response>{
  const { familyLogPage }=await import('./family-log-page');
  return familyLogPage(request,ctx);
}
