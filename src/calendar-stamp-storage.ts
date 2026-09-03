export type CalendarStampStorageProvider='ASSETS'|'UPLOAD';

export const CALENDAR_STAMP_STORAGE_KEY_MAX_LENGTH=512;

const CONTROL_CHARACTER_RE=/[\u0000-\u001f\u007f]/;
const ABSOLUTE_SCHEME_RE=/^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Logical storage providers are persisted independently of the physical backend.
 * ASSETS means repository-managed static assets. UPLOAD means app-managed media;
 * it intentionally does not name R2 so a future R2 binding can back UPLOAD without
 * rewriting Calendar stamp metadata or placements.
 */
export function normalizeCalendarStampStorageProvider(value:unknown):CalendarStampStorageProvider{
  if(value==='ASSETS'||value==='UPLOAD')return value;
  throw new Error('invalid calendar stamp storage provider');
}

/**
 * Keep persisted keys backend-neutral: no URLs, credentials, bucket names or traversal.
 * Canonical slash-separated keys can later be mapped to an R2 object key by the
 * transport layer while existing ASSETS paths continue to work unchanged.
 */
export function normalizeCalendarStampStorageKey(value:unknown,label='calendar stamp storage key'):string{
  const raw=String(value??'').trim();
  if(!raw||raw.length>CALENDAR_STAMP_STORAGE_KEY_MAX_LENGTH)throw new Error(`invalid ${label}`);
  const lower=raw.toLowerCase();
  if(lower.startsWith('data:')||ABSOLUTE_SCHEME_RE.test(raw)||raw.includes('://')||CONTROL_CHARACTER_RE.test(raw))throw new Error(`invalid ${label}`);
  const normalized=raw.replaceAll('\\','/').replace(/^\/+/, '');
  if(!normalized||normalized.includes('//')||normalized.split('/').some(segment=>segment==='..'))throw new Error(`invalid ${label}`);
  return normalized;
}

/**
 * Stable tenant namespace for the future UPLOAD backing store (for example R2).
 * It is not used for ASSETS and does not imply that an R2 binding exists today.
 */
export function calendarStampManagedUploadObjectKey(familyId:number,storageKey:unknown):string{
  if(!Number.isSafeInteger(familyId)||familyId<=0)throw new Error('invalid calendar stamp family');
  const key=normalizeCalendarStampStorageKey(storageKey,'calendar stamp upload key');
  return `families/${familyId}/calendar-stamps/${key}`;
}
