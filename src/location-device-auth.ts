import type { LocationProvider } from './location-domain';

type LocationDeviceRow=Readonly<{
  id:unknown;
  public_id:unknown;
  family_id:unknown;
  member_id:unknown;
  provider:unknown;
  secret_hash:unknown;
}>;

export type AuthenticatedLocationDevice=Readonly<{
  id:number;
  publicId:string;
  familyId:number;
  memberId:number;
  provider:LocationProvider;
}>;

const MIN_DEVICE_SECRET_LENGTH=32;
const MAX_DEVICE_SECRET_LENGTH=512;
const MIN_PUBLIC_ID_LENGTH=16;
const MAX_PUBLIC_ID_LENGTH=128;
const SHA256_HEX_LENGTH=64;

const isLocationProvider=(value:string):value is LocationProvider=>
  value==='OWNTRACKS'||value==='FAMILYTODO_ANDROID';

const isSafePublicId=(value:string):boolean=>{
  const normalized=value.trim();
  return normalized.length>=MIN_PUBLIC_ID_LENGTH&&
    normalized.length<=MAX_PUBLIC_ID_LENGTH&&
    !/[\u0000-\u001f\u007f]/.test(normalized);
};

const isSafePresentedSecret=(value:string):boolean=>
  value.length>=MIN_DEVICE_SECRET_LENGTH&&value.length<=MAX_DEVICE_SECRET_LENGTH;

const bytesToHex=(bytes:Uint8Array):string=>
  Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');

/** Shared by future one-time device provisioning and credential verification. */
export async function hashLocationDeviceSecret(secret:string):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
  return bytesToHex(new Uint8Array(digest));
}

const constantTimeHexEqual=(left:string,right:string):boolean=>{
  const a=left.toLowerCase();
  const b=right.toLowerCase();
  let different=a.length^b.length;
  const length=Math.max(a.length,b.length);
  for(let i=0;i<length;i++){
    different|=(a.charCodeAt(i%Math.max(1,a.length))||0)^(b.charCodeAt(i%Math.max(1,b.length))||0);
  }
  return different===0;
};

/**
 * Verifies a Location device credential without exposing whether a public ID,
 * member, sharing state, or secret caused rejection. Only active members in the
 * same family as the device are eligible. Disabled, revoked, or share-off
 * devices fail closed before any public ingestion route exists.
 *
 * Plaintext device secrets are never returned, persisted, or logged here.
 */
export async function verifyLocationDeviceCredential(
  db:D1Database,
  publicId:string,
  presentedSecret:string,
):Promise<AuthenticatedLocationDevice|null>{
  const normalizedPublicId=publicId.trim();
  if(!isSafePublicId(normalizedPublicId)||!isSafePresentedSecret(presentedSecret))return null;

  const presentedHash=await hashLocationDeviceSecret(presentedSecret);
  const row=await db.prepare(`
    SELECT d.id,d.public_id,d.family_id,d.member_id,d.provider,d.secret_hash
    FROM location_devices d
    JOIN members m
      ON m.id=d.member_id
     AND m.family_id=d.family_id
     AND m.active=1
    WHERE d.public_id=?
      AND d.enabled=1
      AND d.sharing_enabled=1
      AND d.revoked_at IS NULL
    LIMIT 1
  `).bind(normalizedPublicId).first<LocationDeviceRow>();
  if(!row)return null;

  const id=Number(row.id);
  const familyId=Number(row.family_id);
  const memberId=Number(row.member_id);
  const storedPublicId=String(row.public_id??'');
  const provider=String(row.provider??'');
  const secretHash=String(row.secret_hash??'').trim();
  if(!Number.isSafeInteger(id)||id<=0||
    !Number.isSafeInteger(familyId)||familyId<=0||
    !Number.isSafeInteger(memberId)||memberId<=0||
    storedPublicId!==normalizedPublicId||
    !isLocationProvider(provider)||
    !/^[0-9a-fA-F]{64}$/.test(secretHash)||secretHash.length!==SHA256_HEX_LENGTH||
    !constantTimeHexEqual(secretHash,presentedHash)){
    return null;
  }

  return Object.freeze({id,publicId:storedPublicId,familyId,memberId,provider});
}
