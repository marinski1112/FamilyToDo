import type {CalendarStampPlacement} from './calendar-stamps';

export type CalendarStampAssetVariant='thumbnail'|'full';

const ASSET_PATH_RE=/^\/?[A-Za-z0-9._~/-]+$/;

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
  if(placement.storage_provider!=='ASSETS')return null;
  const key=variant==='thumbnail'&&placement.thumbnail_storage_key
    ?placement.thumbnail_storage_key
    :placement.storage_key;
  if(!ASSET_PATH_RE.test(key)||key.includes('..')||key.includes('//'))return null;
  const normalized=key.replace(/^\/+/, '');
  if(!normalized)return null;
  return `/${normalized}`;
}
