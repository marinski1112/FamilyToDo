import type {NormalizedLocationPoint} from './location-domain';
import {D1LocationQueryService} from './location-query-service';
import {readKnownLocationPlaces} from './location-places-api';
import {placePresence} from './location-stay-report';
import {sendMemberWebPush,webPushConfigured} from './webpush';

type State={place_version:string;recorded_at:string;state:'IN'|'OUT';last_arrival_at:string|null;pending_since:string|null};
export function arrivalDecision(old:State|null,state:'IN'|'OUT'|'UNKNOWN',version:string,recordedAt:string){
  const now=Date.parse(recordedAt),delta=old?now-Date.parse(old.recorded_at):Infinity;
  if(state==='UNKNOWN'||(old&&delta<=0))return null;
  if(!old||old.place_version!==version||delta>30*60000)return {state,pending:null,notify:false};
  if(state==='OUT')return {state,pending:null,notify:false};
  if(old.state==='IN')return {state,pending:null,notify:false};
  if(!old.pending_since)return {state:'OUT' as const,pending:recordedAt,notify:false};
  if(now-Date.parse(old.pending_since)<60000)return {state:'OUT' as const,pending:old.pending_since,notify:false};
  return {state:'IN' as const,pending:null,notify:!old.last_arrival_at||now-Date.parse(old.last_arrival_at)>=20*60000};
}
/** Post-ingress best-effort delivery. Claims occur before send; ambiguous sends are never retried automatically. */
export async function processLocationArrival(env:Env,point:NormalizedLocationPoint):Promise<void>{
  if(!webPushConfigured(env))return;
  const age=Date.now()-Date.parse(point.recordedAt);if(age>10*60000||age< -60000)return;
  const {familyId,memberId}=point;
  const recipients=await env.DB.prepare(`SELECT p.member_id FROM location_arrival_preferences p JOIN members m ON m.id=p.member_id AND m.family_id=p.family_id AND m.active=1 AND m.deleted_at IS NULL WHERE p.family_id=? AND p.enabled=1 ORDER BY p.member_id LIMIT 4`).bind(familyId).all<{member_id:number}>();
  if(!recipients.results.length)return;
  const service=new D1LocationQueryService(env.DB);
  const current=await service.latest({scope:{familyId,requesterMemberId:memberId},subjectMemberId:memberId});
  if(!current||current.recordedAt!==point.recordedAt)return;
  const places=await readKnownLocationPlaces(env.DB,familyId);
  const states=await env.DB.prepare('SELECT place_key,place_version,recorded_at,state,last_arrival_at,pending_since FROM location_arrival_states WHERE family_id=? AND member_id=? LIMIT 13').bind(familyId,memberId).all<State&{place_key:string}>();
  for(const place of places){
    const previous=states.results.find(s=>s.place_key===place.key)||null;
    const next=arrivalDecision(previous,placePresence(current,place),place.version,point.recordedAt);if(!next)continue;
    const lastArrival=next.notify?point.recordedAt:previous?.last_arrival_at||null;
    const result=previous?await env.DB.prepare(`UPDATE location_arrival_states SET place_version=?,recorded_at=?,state=?,last_arrival_at=?,pending_since=? WHERE family_id=? AND member_id=? AND place_key=? AND recorded_at=? AND place_version=?`).bind(place.version,point.recordedAt,next.state,lastArrival,next.pending,familyId,memberId,place.key,previous.recorded_at,previous.place_version).run()
      :await env.DB.prepare('INSERT OR IGNORE INTO location_arrival_states(family_id,member_id,place_key,place_version,recorded_at,state,last_arrival_at,pending_since) VALUES(?,?,?,?,?,?,?,?)').bind(familyId,memberId,place.key,place.version,point.recordedAt,next.state,lastArrival,next.pending).run();
    if(!next.notify||Number(result.meta.changes)!==1)continue;
    for(const recipient of recipients.results){
      const visible=await service.latest({scope:{familyId,requesterMemberId:recipient.member_id},subjectMemberId:memberId});
      if(!visible||placePresence(visible,place)!=='IN'||Date.now()-Date.parse(visible.recordedAt)>10*60000)continue;
      const claim=await env.DB.prepare(`INSERT OR IGNORE INTO location_arrival_deliveries(family_id,member_id,recipient_id,place_key,recorded_at,status)
        SELECT ?,?,?,?,?,'ATTEMPTED' WHERE EXISTS(SELECT 1 FROM location_arrival_preferences WHERE family_id=? AND member_id=? AND enabled=1)`).bind(familyId,memberId,recipient.member_id,place.key,point.recordedAt,familyId,recipient.member_id).run();
      if(Number(claim.meta.changes)!==1)continue;
      const name=await env.DB.prepare('SELECT name FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(memberId,familyId).first<{name:string}>();
      if(!name)continue;
      try{
        const result=await sendMemberWebPush(env,familyId,recipient.member_id,{title:'家族の到着',body:`${String(name.name).slice(0,40)}さんが${place.label}に到着しました。`,url:'/app/location.php',tag:`location-arrival-${memberId}-${place.key}`},2);
        await env.DB.prepare('UPDATE location_arrival_deliveries SET status=? WHERE id=? AND family_id=?').bind(result.ok?'SENT':'FAILED',Number(claim.meta.last_row_id),familyId).run();
      }catch{/* Keep ATTEMPTED: the remote delivery result is unknown; do not duplicate it. */}
    }
    return; // At most one place arrival per ingress; overlapping places must not fan out repeatedly.
  }
}
export async function cleanupLocationArrivals(env:Env):Promise<void>{
  await env.DB.batch([
    env.DB.prepare("DELETE FROM location_arrival_deliveries WHERE created_at<datetime('now','-7 days')"),
    env.DB.prepare("DELETE FROM location_arrival_states WHERE recorded_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')"),
  ]);
}
