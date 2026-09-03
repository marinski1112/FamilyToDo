import type { NormalizedLocationPoint } from './location-domain';
import type { AuthenticatedLocationDevice } from './location-device-auth';
import { isValidLatitude, isValidLongitude } from './location-domain';

const SHA256_HEX_LENGTH=64;

const bytesToHex=(bytes:Uint8Array):string=>
  Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');

const canonicalIso=(value:string):boolean=>{
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString()===value;
};

const validOptionalNumber=(value:number|undefined,predicate:(value:number)=>boolean):boolean=>
  value===undefined||(Number.isFinite(value)&&predicate(value));

const pointMatchesAuthenticatedDevice=(
  device:AuthenticatedLocationDevice,
  point:NormalizedLocationPoint,
):boolean=>
  Number.isSafeInteger(device.id)&&device.id>0&&
  Number.isSafeInteger(device.familyId)&&device.familyId>0&&
  Number.isSafeInteger(device.memberId)&&device.memberId>0&&
  point.familyId===device.familyId&&
  point.memberId===device.memberId&&
  point.provider===device.provider&&
  point.deviceId===device.publicId&&
  isValidLatitude(point.latitude)&&
  isValidLongitude(point.longitude)&&
  canonicalIso(point.recordedAt)&&
  canonicalIso(point.receivedAt)&&
  validOptionalNumber(point.accuracyMeters,value=>value>=0)&&
  validOptionalNumber(point.altitudeMeters,()=>true)&&
  validOptionalNumber(point.speedMetersPerSecond,value=>value>=0)&&
  validOptionalNumber(point.headingDegrees,value=>value>=0&&value<=360)&&
  validOptionalNumber(point.batteryPercent,value=>value>=0&&value<=100);

/**
 * Builds a provider-neutral replay key from normalized fields only. Raw provider
 * payloads, credentials, addresses and request metadata are intentionally absent.
 */
export async function buildLocationPointDedupeKey(point:NormalizedLocationPoint):Promise<string>{
  const canonical=JSON.stringify([
    point.provider,point.familyId,point.memberId,point.deviceId,
    point.recordedAt,point.latitude,point.longitude,
  ]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Persists an already-authenticated, normalized Location point.
 *
 * This service is deliberately not an HTTP boundary. The caller must first
 * authenticate the device and normalize the provider payload. Identity is
 * checked again here before any mutation. Every mutation also re-checks the
 * current device/member sharing state in D1, so revoke/disable/share-off fails
 * closed even if it changes after credential verification. History is replay-
 * safe and latest only moves forward by sensor time (then receipt time).
 *
 * The boolean return means the device/member authorization was still valid at
 * mutation time. A duplicate or older point may therefore return true without
 * changing history/latest, while a revoked/share-off/inactive device returns false.
 */
export async function persistAuthenticatedLocationPoint(
  db:D1Database,
  device:AuthenticatedLocationDevice,
  point:NormalizedLocationPoint,
):Promise<boolean>{
  if(!pointMatchesAuthenticatedDevice(device,point))return false;

  const dedupeKey=await buildLocationPointDedupeKey(point);
  if(dedupeKey.length!==SHA256_HEX_LENGTH)return false;

  const telemetry=[
    point.accuracyMeters??null,
    point.altitudeMeters??null,
    point.speedMetersPerSecond??null,
    point.headingDegrees??null,
    point.batteryPercent??null,
  ] as const;

  const activeDeviceWhere=`
    d.id=? AND d.public_id=? AND d.family_id=? AND d.member_id=? AND d.provider=?
    AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL
  `;

  const history=db.prepare(`
    INSERT INTO member_location_history (
      family_id,member_id,device_id,provider,dedupe_key,
      latitude,longitude,accuracy_meters,altitude_meters,
      speed_meters_per_second,heading_degrees,battery_percent,trigger,
      recorded_at,received_at
    )
    SELECT
      d.family_id,
      d.member_id,
      d.id,
      d.provider,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    FROM location_devices d
    JOIN members m
      ON m.id=d.member_id AND m.family_id=d.family_id AND m.active=1
    WHERE ${activeDeviceWhere}
    ON CONFLICT(device_id,dedupe_key) DO NOTHING
  `).bind(
    dedupeKey,
    point.latitude,point.longitude,...telemetry,point.trigger,
    point.recordedAt,point.receivedAt,
    device.id,device.publicId,device.familyId,device.memberId,device.provider,
  );

  const latest=db.prepare(`
    INSERT INTO member_location_latest (
      member_id,family_id,device_id,provider,latitude,longitude,
      accuracy_meters,altitude_meters,speed_meters_per_second,
      heading_degrees,battery_percent,trigger,recorded_at,received_at,updated_at
    )
    SELECT
      d.member_id,
      d.family_id,
      d.id,
      d.provider,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP
    FROM location_devices d
    JOIN members m
      ON m.id=d.member_id AND m.family_id=d.family_id AND m.active=1
    WHERE ${activeDeviceWhere}
    ON CONFLICT(member_id) DO UPDATE SET
      family_id=excluded.family_id,
      device_id=excluded.device_id,
      provider=excluded.provider,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      accuracy_meters=excluded.accuracy_meters,
      altitude_meters=excluded.altitude_meters,
      speed_meters_per_second=excluded.speed_meters_per_second,
      heading_degrees=excluded.heading_degrees,
      battery_percent=excluded.battery_percent,
      trigger=excluded.trigger,
      recorded_at=excluded.recorded_at,
      received_at=excluded.received_at,
      updated_at=CURRENT_TIMESTAMP
    WHERE excluded.family_id=member_location_latest.family_id
      AND (
        excluded.recorded_at>member_location_latest.recorded_at OR
        (excluded.recorded_at=member_location_latest.recorded_at
          AND excluded.received_at>member_location_latest.received_at)
      )
  `).bind(
    point.latitude,point.longitude,...telemetry,point.trigger,
    point.recordedAt,point.receivedAt,
    device.id,device.publicId,device.familyId,device.memberId,device.provider,
  );

  const deviceSeen=db.prepare(`
    UPDATE location_devices
    SET last_seen_at=CASE
      WHEN last_seen_at IS NULL OR last_seen_at<? THEN ?
      ELSE last_seen_at
    END,
    updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND public_id=? AND family_id=? AND member_id=? AND provider=?
      AND enabled=1 AND sharing_enabled=1 AND revoked_at IS NULL
      AND EXISTS (
        SELECT 1 FROM members m
        WHERE m.id=location_devices.member_id
          AND m.family_id=location_devices.family_id
          AND m.active=1
      )
  `).bind(
    point.receivedAt,point.receivedAt,
    device.id,device.publicId,device.familyId,device.memberId,device.provider,
  );

  const results=await db.batch([history,latest,deviceSeen]);
  const authorizedChanges=Number(results[2]?.meta?.changes??0);
  return Number.isFinite(authorizedChanges)&&authorizedChanges>0;
}
