import type { LocationProvider } from './location-domain';
import { hashLocationDeviceSecret } from './location-device-auth';

type MemberRow=Readonly<{
  id:unknown;
  role?:unknown;
}>;

type ProvisionedDeviceRow=Readonly<{
  id:unknown;
}>;

export type ProvisionedLocationDevice=Readonly<{
  id:number;
  publicId:string;
  secret:string;
  familyId:number;
  memberId:number;
  provider:LocationProvider;
  sharingEnabled:false;
}>;

const isPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;
const isLocationProvider=(value:string):value is LocationProvider=>
  value==='OWNTRACKS'||value==='FAMILYTODO_ANDROID';

const randomHex=(byteLength:number):string=>{
  const bytes=new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
};

/**
 * Creates one Location device credential without enabling location sharing.
 *
 * The plaintext secret is returned exactly once to the authenticated caller and
 * is never persisted. A caller may provision its own device; OWNER/ADMIN may
 * provision a device for another active member in the same family. Enabling
 * sharing is deliberately a separate, explicit privacy action.
 */
export async function provisionLocationDevice(
  db:D1Database,
  input:Readonly<{
    familyId:number;
    memberId:number;
    createdByMemberId:number;
    provider:LocationProvider;
  }>,
):Promise<ProvisionedLocationDevice>{
  const {familyId,memberId,createdByMemberId,provider}=input;
  if(!isPositiveId(familyId)||!isPositiveId(memberId)||!isPositiveId(createdByMemberId)||!isLocationProvider(provider)){
    throw new Error('INVALID_LOCATION_DEVICE_PROVISIONING_REQUEST');
  }

  const creator=await db.prepare(`
    SELECT id,role
    FROM members
    WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL
    LIMIT 1
  `).bind(createdByMemberId,familyId).first<MemberRow>();
  if(!creator)throw new Error('LOCATION_DEVICE_PROVISIONING_FORBIDDEN');

  const creatorRole=String(creator.role??'').toUpperCase();
  const canProvision=createdByMemberId===memberId||creatorRole==='OWNER'||creatorRole==='ADMIN';
  if(!canProvision)throw new Error('LOCATION_DEVICE_PROVISIONING_FORBIDDEN');

  const target=await db.prepare(`
    SELECT id
    FROM members
    WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL
    LIMIT 1
  `).bind(memberId,familyId).first<MemberRow>();
  if(!target)throw new Error('LOCATION_DEVICE_MEMBER_NOT_FOUND');

  const publicId=`loc_${crypto.randomUUID().replaceAll('-','')}`;
  const secret=randomHex(32);
  const secretHash=await hashLocationDeviceSecret(secret);

  const inserted=await db.prepare(`
    INSERT INTO location_devices(
      public_id,family_id,member_id,provider,secret_hash,
      enabled,sharing_enabled,created_by_member_id,created_at,updated_at
    ) VALUES(?,?,?,?,?,1,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    RETURNING id
  `).bind(publicId,familyId,memberId,provider,secretHash,createdByMemberId).first<ProvisionedDeviceRow>();

  const id=Number(inserted?.id);
  if(!isPositiveId(id))throw new Error('LOCATION_DEVICE_PROVISIONING_FAILED');

  return Object.freeze({
    id,
    publicId,
    secret,
    familyId,
    memberId,
    provider,
    sharingEnabled:false,
  });
}
