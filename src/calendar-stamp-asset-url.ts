import type {CalendarStampPlacement} from './calendar-stamps';

export type CalendarStampAssetVariant='thumbnail'|'full';

const ASSET_PATH_RE=/^\/?[A-Za-z0-9._~/-]+$/;

export function calendarStampStorageKeyUrl(storageProvider:'ASSETS'|'UPLOAD',storageKey:string):string|null{
  if(storageProvider!=='ASSETS')return null;
  if(!ASSET_PATH_RE.test(storageKey)||storageKey.includes('..')||storageKey.includes('//'))return null;
  const normalized=storageKey.replace(/^\/+/, '');
  if(!normalized)return null;
  return `/${normalized}`;
}

/**
 * Resolve an already-provisioned Calendar stamp backed by Worker static ASSETS.
 *
 * UPLOAD is intentionally unresolved until a concrete authenticated upload/R2
 * transport exists. Returning null keeps future renderer wiring fail-closed.
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
