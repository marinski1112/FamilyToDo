import { utcNow } from './timezone';

export type CalendarSharedStampRepresentation='SINGLE_FILE'|'FRAME_SEQUENCE';

export type CalendarSharedStampRef={
  asset_id:number;
  shared_stamp_id:string;
  shared_version:number;
  representation:CalendarSharedStampRepresentation;
};

const SHARED_STAMP_ID_RE=/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

function positiveId(value:number,label:string):number{
  if(!Number.isSafeInteger(value)||value<=0)throw new Error(`invalid ${label}`);
  return value;
}

export function normalizeCalendarSharedStampId(value:unknown):string{
  const id=String(value??'').trim();
  if(!SHARED_STAMP_ID_RE.test(id))throw new Error('invalid shared stamp id');
  return id;
}

export function normalizeCalendarSharedStampVersion(value:unknown):number{
  const version=Number(value);
  if(!Number.isSafeInteger(version)||version<=0)throw new Error('invalid shared stamp version');
  return version;
}

export function normalizeCalendarSharedStampRepresentation(value:unknown):CalendarSharedStampRepresentation{
  if(value==='SINGLE_FILE'||value==='FRAME_SEQUENCE')return value;
  throw new Error('invalid shared stamp representation');
}

async function assertActiveAdmin(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1")
    .bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp admin required');
}

/**
 * Attach an immutable shared-catalog identity to one existing local stamp asset.
 * Placements and message attachments continue to reference the local asset id.
 * Repeating the exact mapping is idempotent; remapping an asset/version is rejected.
 */
export async function attachCalendarSharedStampRef(
  env:Env,
  familyId:number,
  memberId:number,
  assetId:number,
  input:{sharedStampId:unknown;sharedVersion:unknown;representation:unknown},
):Promise<CalendarSharedStampRef>{
  positiveId(familyId,'calendar stamp family');
  positiveId(memberId,'calendar stamp member');
  positiveId(assetId,'calendar stamp asset');
  const sharedStampId=normalizeCalendarSharedStampId(input.sharedStampId);
  const sharedVersion=normalizeCalendarSharedStampVersion(input.sharedVersion);
  const representation=normalizeCalendarSharedStampRepresentation(input.representation);
  await assertActiveAdmin(env,familyId,memberId);

  const existing=await env.DB.prepare(`SELECT asset_id,shared_stamp_id,shared_version,representation
    FROM calendar_shared_stamp_refs WHERE asset_id=? AND family_id=? LIMIT 1`)
    .bind(assetId,familyId).first<CalendarSharedStampRef>();
  if(existing){
    if(existing.shared_stamp_id===sharedStampId
      && Number(existing.shared_version)===sharedVersion
      && existing.representation===representation)return existing;
    throw new Error('calendar shared stamp asset already mapped');
  }

  const versionOwner=await env.DB.prepare(`SELECT asset_id FROM calendar_shared_stamp_refs
    WHERE family_id=? AND shared_stamp_id=? AND shared_version=? LIMIT 1`)
    .bind(familyId,sharedStampId,sharedVersion).first<{asset_id:number}>();
  if(versionOwner)throw new Error('calendar shared stamp version already mapped');

  const now=utcNow();
  const result=await env.DB.prepare(`INSERT INTO calendar_shared_stamp_refs(
      family_id,asset_id,shared_stamp_id,shared_version,representation,created_at,synchronized_at
    )
    SELECT ?,asset.id,?,?,?,?,?
    FROM calendar_stamp_assets asset
    WHERE asset.id=? AND asset.family_id=?
      AND EXISTS(SELECT 1 FROM members actor
        WHERE actor.id=? AND actor.family_id=? AND actor.active=1 AND actor.role IN ('OWNER','ADMIN'))`)
    .bind(familyId,sharedStampId,sharedVersion,representation,now,now,assetId,familyId,memberId,familyId).run();
  if(Number(result.meta.changes||0)!==1)throw new Error('calendar shared stamp asset unavailable');
  return {asset_id:assetId,shared_stamp_id:sharedStampId,shared_version:sharedVersion,representation};
}

export async function calendarSharedStampRefForAsset(
  env:Env,
  familyId:number,
  memberId:number,
  assetId:number,
):Promise<CalendarSharedStampRef|null>{
  positiveId(familyId,'calendar stamp family');
  positiveId(memberId,'calendar stamp member');
  positiveId(assetId,'calendar stamp asset');
  const member=await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1')
    .bind(memberId,familyId).first<{id:number}>();
  if(!member)throw new Error('calendar stamp member unavailable');
  const row=await env.DB.prepare(`SELECT ref.asset_id,ref.shared_stamp_id,ref.shared_version,ref.representation
    FROM calendar_shared_stamp_refs ref
    JOIN calendar_stamp_assets asset ON asset.id=ref.asset_id AND asset.family_id=ref.family_id
    WHERE ref.asset_id=? AND ref.family_id=? LIMIT 1`)
    .bind(assetId,familyId).first<CalendarSharedStampRef>();
  return row??null;
}
