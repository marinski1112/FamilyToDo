import type {AppContext} from './app-context';
import {json} from './response';

type QualityRow=Readonly<{
  id:number;
  member_id:number;
  member_name:string|null;
  device_id:number;
  accuracy_meters:number|null;
  trigger:string|null;
  recorded_at:string;
  received_at:string;
  latest_device_id:number|null;
  latest_recorded_at:string|null;
  latest_received_at:string|null;
}>;

type AccuracyBand='EXCELLENT'|'GOOD'|'FAIR'|'POOR'|'UNKNOWN';
type AccuracyTrend='IMPROVED'|'WORSENED'|'SAME'|'UNKNOWN';

const MAX_POINTS=40;
const isPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;

function fail(status:number,code:string,message:string):Response{
  return json({ok:false,error:message,code},status,{'cache-control':'no-store'});
}

function isAdmin(ctx:AppContext):boolean{
  const role=String(ctx.member?.role||'').toUpperCase();
  return role==='OWNER'||role==='ADMIN';
}

function accuracyBand(value:number|null):AccuracyBand{
  if(value===null||!Number.isFinite(value)||value<0)return 'UNKNOWN';
  if(value<=20)return 'EXCELLENT';
  if(value<=50)return 'GOOD';
  if(value<=100)return 'FAIR';
  return 'POOR';
}

function secondsBetween(newer:string,older:string):number|null{
  const a=Date.parse(newer),b=Date.parse(older);
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;
  return Math.max(0,Math.round((a-b)/1000));
}

function accuracyTrend(newer:number|null,older:number|null):AccuracyTrend{
  if(newer===null||older===null||!Number.isFinite(newer)||!Number.isFinite(older))return 'UNKNOWN';
  if(newer<older)return 'IMPROVED';
  if(newer>older)return 'WORSENED';
  return 'SAME';
}

/**
 * Privacy-safe Location quality diagnostics.
 *
 * Deliberately selects no coordinates, addresses, public device IDs, credentials,
 * request bodies or raw provider payloads. This endpoint is for determining
 * whether OwnTracks is supplying coarse fixes and whether such fixes become the
 * current newest point. It is observational only and never changes Location data.
 */
export async function locationQualityDiagnosticsApi(request:Request,ctx:AppContext):Promise<Response>{
  if(!ctx.member)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');
  if(!isAdmin(ctx))return fail(403,'ADMIN_REQUIRED','管理者のみ確認できます。');

  const familyId=Number(ctx.member.family_id);
  if(!isPositiveId(familyId))return fail(403,'FORBIDDEN','参照できません。');

  const result=await ctx.env.DB.prepare(`
    SELECT
      h.id,
      h.member_id,
      m.name AS member_name,
      h.device_id,
      h.accuracy_meters,
      h.trigger,
      h.recorded_at,
      h.received_at,
      l.device_id AS latest_device_id,
      l.recorded_at AS latest_recorded_at,
      l.received_at AS latest_received_at
    FROM member_location_history h
    JOIN members m
      ON m.id=h.member_id AND m.family_id=h.family_id AND m.active=1
    JOIN location_devices d
      ON d.id=h.device_id
      AND d.family_id=h.family_id
      AND d.member_id=h.member_id
      AND d.provider='OWNTRACKS'
      AND d.enabled=1
      AND d.sharing_enabled=1
      AND d.revoked_at IS NULL
    LEFT JOIN member_location_latest l
      ON l.family_id=h.family_id AND l.member_id=h.member_id
    WHERE h.family_id=?
    ORDER BY h.recorded_at DESC,h.id DESC
    LIMIT ${MAX_POINTS}
  `).bind(familyId).all<QualityRow>();

  // The query is newest-first. Build an explicit older-neighbour map by walking
  // oldest-to-newest so interval/trend labels cannot accidentally compare a row
  // against a newer fix.
  const olderById=new Map<number,QualityRow>();
  const lastOlderByDevice=new Map<string,QualityRow>();
  for(const row of [...result.results].reverse()){
    const key=`${row.member_id}:${row.device_id}`;
    const older=lastOlderByDevice.get(key);
    if(older)olderById.set(Number(row.id),older);
    lastOlderByDevice.set(key,row);
  }

  const points=result.results.map((row)=>{
    const older=olderById.get(Number(row.id))||null;
    const accuracy=row.accuracy_meters===null?null:Number(row.accuracy_meters);
    const olderAccuracy=older===null||older.accuracy_meters===null?null:Number(older.accuracy_meters);
    const isCurrentLatest=Number(row.latest_device_id)===Number(row.device_id)
      &&row.latest_recorded_at===row.recorded_at
      &&row.latest_received_at===row.received_at;
    return {
      memberId:Number(row.member_id),
      memberName:String(row.member_name||'家族'),
      recordedAt:row.recorded_at,
      receivedDelaySeconds:secondsBetween(row.received_at,row.recorded_at),
      accuracyMeters:accuracy,
      accuracyBand:accuracyBand(accuracy),
      trigger:String(row.trigger||'UNKNOWN'),
      intervalSecondsToOlder:older?secondsBetween(row.recorded_at,older.recorded_at):null,
      accuracyTrendVsOlder:older?accuracyTrend(accuracy,olderAccuracy):'UNKNOWN' as AccuracyTrend,
      isCurrentLatest,
    };
  });

  const poorAccuracyCount=points.filter(point=>point.accuracyBand==='POOR').length;
  const currentLatestPoints=points.filter(point=>point.isCurrentLatest);
  const latestPoorAccuracyCount=currentLatestPoints.filter(point=>point.accuracyBand==='POOR').length;
  const latestUnknownAccuracyCount=currentLatestPoints.filter(point=>point.accuracyBand==='UNKNOWN').length;
  const interpretation=points.length===0
    ?'NO_POINTS'
    :latestPoorAccuracyCount>0
      ?'LATEST_POOR_ACCURACY_PRESENT'
      :poorAccuracyCount>0
        ?'POOR_SOURCE_POINTS_SEEN'
        :'NO_POOR_ACCURACY_SEEN';

  return json({
    ok:true,
    policy:{latestSelection:'NEWEST_SENSOR_TIME',qualityAware:false,poorThresholdMeters:100},
    summary:{
      pointCount:points.length,
      currentLatestCount:currentLatestPoints.length,
      poorAccuracyCount,
      latestPoorAccuracyCount,
      latestUnknownAccuracyCount,
      interpretation,
    },
    points,
  },200,{'cache-control':'no-store'});
}
