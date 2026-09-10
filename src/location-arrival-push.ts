import type {NormalizedLocationPoint} from './location-domain';
import {D1LocationQueryService} from './location-query-service';
import {readKnownLocationPlaces} from './location-places-api';
import {placeProximity,type LocationProximityPhase} from './location-stay-report';
import {sendMemberWebPush,webPushConfigured} from './webpush';

type StablePhase=Exclude<LocationProximityPhase,'UNKNOWN'>;
type AlertEvent='APPROACH'|'LEAVE';
type State={place_version:string;recorded_at:string;state:'IN'|'OUT';last_arrival_at:string|null;pending_since:string|null;phase?:StablePhase|null;pending_phase?:StablePhase|null;last_approach_at?:string|null;last_leave_at?:string|null};
const legacyPhase=(state:State):StablePhase=>state.phase||(state.state==='IN'?'INSIDE':'OUTSIDE');
const EVENT_COOLDOWN_MS=20*60000;
export function locationAlertDecision(old:State|null,observed:LocationProximityPhase,version:string,recordedAt:string){
  const now=Date.parse(recordedAt),delta=old?now-Date.parse(old.recorded_at):Infinity;
  if(observed==='UNKNOWN'||!Number.isFinite(now)||(old&&(!Number.isFinite(delta)||delta<=0)))return null;
  if(!old||old.place_version!==version||delta>30*60000)return {phase:observed,pendingPhase:null,pendingSince:null,event:null as AlertEvent|null,notify:false};
  const prior=legacyPhase(old);
  if(observed===prior)return {phase:prior,pendingPhase:null,pendingSince:null,event:null as AlertEvent|null,notify:false};
  if(old.pending_phase!==observed||!old.pending_since)return {phase:prior,pendingPhase:observed,pendingSince:recordedAt,event:null as AlertEvent|null,notify:false};
  if(now-Date.parse(old.pending_since)<60000)return {phase:prior,pendingPhase:observed,pendingSince:old.pending_since,event:null as AlertEvent|null,notify:false};
  const event:AlertEvent|null=prior==='OUTSIDE'&&observed==='APPROACHING'?'APPROACH':prior==='INSIDE'&&observed!=='INSIDE'?'LEAVE':null;
  const lastEventAt=event==='APPROACH'?old.last_approach_at:event==='LEAVE'?old.last_leave_at:null;
  const notify=Boolean(event)&&(!lastEventAt||now-Date.parse(lastEventAt)>=EVENT_COOLDOWN_MS);
  return {phase:observed,pendingPhase:null,pendingSince:null,event,notify};
}
/** @deprecated Retained for regression/import compatibility; semantics are APPROACH/LEAVE, never ARRIVE. */
export const arrivalDecision=locationAlertDecision;
/** Post-ingress best-effort delivery. Claims occur before send; ambiguous sends are never retried automatically. */
export async function processLocationArrival(env:Env,point:NormalizedLocationPoint):Promise<void>{
  if(!webPushConfigured(env))return;
  const age=Date.now()-Date.parse(point.recordedAt);if(age>10*60000||age< -60000)return;
  const {familyId,memberId}=point;
  const recipients=await env.DB.prepare(`SELECT p.member_id FROM location_arrival_preferences p JOIN members m ON m.id=p.member_id AND m.family_id=p.family_id AND m.active=1 AND m.deleted_at IS NULL AND COALESCE(m.notification_enabled,1)=1 WHERE p.family_id=? AND p.enabled=1 ORDER BY p.member_id LIMIT 4`).bind(familyId).all<{member_id:number}>();
  if(!recipients.results.length)return;
  const service=new D1LocationQueryService(env.DB);
  const current=await service.latest({scope:{familyId,requesterMemberId:memberId},subjectMemberId:memberId});
  if(!current||current.recordedAt!==point.recordedAt)return;
  const places=await readKnownLocationPlaces(env.DB,familyId);
  const states=await env.DB.prepare('SELECT place_key,place_version,recorded_at,state,last_arrival_at,pending_since,phase,pending_phase,last_approach_at,last_leave_at FROM location_arrival_states WHERE family_id=? AND member_id=? LIMIT 13').bind(familyId,memberId).all<State&{place_key:string}>();
  for(const place of places){
    const previous=states.results.find(s=>s.place_key===place.key)||null;
    const previousPhase=previous?legacyPhase(previous):'OUTSIDE';
    const observed=placeProximity(current,place,previousPhase);
    const next=locationAlertDecision(previous,observed,place.version,point.recordedAt);if(!next)continue;
    const lastApproach=next.notify&&next.event==='APPROACH'?point.recordedAt:previous?.last_approach_at||null;
    const lastLeave=next.notify&&next.event==='LEAVE'?point.recordedAt:previous?.last_leave_at||null;
    const legacyState=next.phase==='INSIDE'?'IN':'OUT';
    const result=previous?await env.DB.prepare(`UPDATE location_arrival_states SET place_version=?,recorded_at=?,state=?,pending_since=?,phase=?,pending_phase=?,last_approach_at=?,last_leave_at=? WHERE family_id=? AND member_id=? AND place_key=? AND recorded_at=? AND place_version=?`).bind(place.version,point.recordedAt,legacyState,next.pendingSince,next.phase,next.pendingPhase,lastApproach,lastLeave,familyId,memberId,place.key,previous.recorded_at,previous.place_version).run()
      :await env.DB.prepare('INSERT OR IGNORE INTO location_arrival_states(family_id,member_id,place_key,place_version,recorded_at,state,last_arrival_at,pending_since,phase,pending_phase,last_approach_at,last_leave_at) VALUES(?,?,?,?,?,?,NULL,?,?,?,?,?)').bind(familyId,memberId,place.key,place.version,point.recordedAt,legacyState,next.pendingSince,next.phase,next.pendingPhase,lastApproach,lastLeave).run();
    if(!next.notify||!next.event||Number(result.meta.changes)!==1)continue;
    for(const recipient of recipients.results){
      const visible=await service.latest({scope:{familyId,requesterMemberId:recipient.member_id},subjectMemberId:memberId});
      if(!visible||visible.recordedAt!==point.recordedAt||Date.now()-Date.parse(visible.recordedAt)>10*60000)continue;
      const claim=await env.DB.prepare(`INSERT OR IGNORE INTO location_arrival_deliveries(family_id,member_id,recipient_id,place_key,recorded_at,status,event_type)
        SELECT ?,?,?,?,?,'ATTEMPTED',? WHERE EXISTS(SELECT 1 FROM location_arrival_preferences p JOIN members m ON m.id=p.member_id AND m.family_id=p.family_id AND m.active=1 AND m.deleted_at IS NULL AND COALESCE(m.notification_enabled,1)=1 WHERE p.family_id=? AND p.member_id=? AND p.enabled=1)`).bind(familyId,memberId,recipient.member_id,place.key,point.recordedAt,next.event,familyId,recipient.member_id).run();
      if(Number(claim.meta.changes)!==1)continue;
      const name=await env.DB.prepare('SELECT name FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(memberId,familyId).first<{name:string}>();
      if(!name)continue;
      const memberName=String(name.name).slice(0,40);
      const payload=next.event==='APPROACH'
        ?{title:'家族の接近',body:`${memberName}さんが${place.label}に近づいています。`,url:'/app/location.php',tag:`location-approach-${memberId}-${place.key}`}
        :{title:'家族の出発',body:`${memberName}さんが${place.label}を出ました。`,url:'/app/location.php',tag:`location-leave-${memberId}-${place.key}`};
      try{
        const sent=await sendMemberWebPush(env,familyId,recipient.member_id,payload,2);
        await env.DB.prepare('UPDATE location_arrival_deliveries SET status=? WHERE id=? AND family_id=?').bind(sent.ok?'SENT':'FAILED',Number(claim.meta.last_row_id),familyId).run();
      }catch{/* Keep ATTEMPTED: the remote delivery result is unknown; do not duplicate it. */}
    }
    return; // At most one place event per ingress; overlapping places must not fan out repeatedly.
  }
}
export async function cleanupLocationArrivals(env:Env):Promise<void>{
  await env.DB.batch([
    env.DB.prepare("DELETE FROM location_arrival_deliveries WHERE created_at<datetime('now','-7 days')"),
    env.DB.prepare("DELETE FROM location_arrival_states WHERE recorded_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')"),
  ]);
}
