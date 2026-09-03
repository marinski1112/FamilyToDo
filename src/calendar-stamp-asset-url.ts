import { normalizeCalendarStampStorageKey, type CalendarStampStorageProvider } from './calendar-stamp-storage';
import type {CalendarStampPlacement} from './calendar-stamps';

export type CalendarStampAssetVariant='thumbnail'|'full';

export function calendarStampStorageKeyUrl(storageProvider:CalendarStampStorageProvider,storageKey:string):string|null{
  if(storageProvider!=='ASSETS')return null;
  try{
    const normalized=normalizeCalendarStampStorageKey(storageKey);
    return `/${normalized}`;
  }catch{
    return null;
  }
}

/**
 * Resolve an already-provisioned Calendar stamp backed by Worker static ASSETS.
 *
 * UPLOAD is the migration-stable logical provider for app-managed media. It remains
 * intentionally unresolved until a concrete authenticated upload/R2 transport and
 * binding exist. Returning null keeps future renderer wiring fail-closed without
 * persisting bucket names, remote URLs, credentials, or signed URLs in D1.
 */
export function calendarStampAssetUrl(
  placement:Pick<CalendarStampPlacement,'storage_provider'|'storage_key'|'thumbnail_storage_key'>,
  variant:CalendarStampAssetVariant='full',
):string|null{
  const key=variant==='thumbnail'&&placement.thumbnail_storage_key
    ?placement.thumbnail_storage_key
    :placement.storage_key;
  return calendarStampStorageKeyUrl(placement.storage_provider,key);
}
