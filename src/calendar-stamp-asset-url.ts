import { normalizeCalendarStampStorageKey, type CalendarStampStorageProvider } from './calendar-stamp-storage';
import type {CalendarStampPlacement} from './calendar-stamps';

export type CalendarStampAssetVariant='thumbnail'|'full';

type CalendarStampAssetRef=Pick<CalendarStampPlacement,'storage_provider'|'storage_key'|'thumbnail_storage_key'> & {id?:number;asset_id?:number};

const ASSET_PATH_RE=/^[A-Za-z0-9._~/-]+$/;

export function calendarStampStorageKeyUrl(storageProvider:CalendarStampStorageProvider,storageKey:string):string|null{
  if(storageProvider!=='ASSETS')return null;
  try{
    const normalized=normalizeCalendarStampStorageKey(storageKey);
    if(!ASSET_PATH_RE.test(normalized))return null;
    return `/${normalized}`;
  }catch{
    return null;
  }
}

function assetIdOf(asset:CalendarStampAssetRef):number|null{
  const value=Number(asset.asset_id??asset.id??0);
  return Number.isSafeInteger(value)&&value>0?value:null;
}

/** Same-origin browser URL for a persisted stamp asset without exposing UPLOAD storage keys. */
export function calendarStampAssetUrl(asset:CalendarStampAssetRef,variant:CalendarStampAssetVariant='full'):string|null{
  const key=variant==='thumbnail'&&asset.thumbnail_storage_key?asset.thumbnail_storage_key:asset.storage_key;
  if(asset.storage_provider==='ASSETS')return calendarStampStorageKeyUrl('ASSETS',key);
  if(asset.storage_provider!=='UPLOAD')return null;
  const assetId=assetIdOf(asset);
  if(!assetId)return null;
  return `/api/calendar-stamp-media?asset=${assetId}&variant=${variant}`;
}

/** Same-origin browser URL for one sequential PNG frame. */
export function calendarStampFrameUrl(storageProvider:CalendarStampStorageProvider,assetId:number,frameIndex:number,storageKey:string):string|null{
  if(storageProvider==='ASSETS')return calendarStampStorageKeyUrl('ASSETS',storageKey);
  if(storageProvider!=='UPLOAD'||!Number.isSafeInteger(assetId)||assetId<=0||!Number.isSafeInteger(frameIndex)||frameIndex<0||frameIndex>=48)return null;
  return `/api/calendar-stamp-media?asset=${assetId}&frame=${frameIndex}`;
}
