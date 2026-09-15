import type { LocationPoint } from './location-providers';

export type KnownLocationPlace={key:string;label:string;latitude:number;longitude:number;accuracyMeters:number;version:string};
export type LocationProximityPhase='OUTSIDE'|'APPROACHING'|'INSIDE'|'UNKNOWN';
export function locationDistance(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}):number{
  const r=Math.PI/180,h=Math.sin((b.latitude-a.latitude)*r/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin((b.longitude-a.longitude)*r/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
function placeUncertainty(point:LocationPoint,place:KnownLocationPlace){
  const pointAccuracy=Number(point.accuracyMeters),placeAccuracy=Number(place.accuracyMeters);
  if(!Number.isFinite(pointAccuracy)||!Number.isFinite(placeAccuracy)||pointAccuracy<0||placeAccuracy<0||pointAccuracy>150||placeAccuracy>100)return null;
  return pointAccuracy+placeAccuracy;
}
function insideRadius(uncertainty:number){return 150+Math.min(75,uncertainty*.5);}
function insideExitRadius(uncertainty:number){return 220+Math.min(90,uncertainty*.5);}
function approachRadius(uncertainty:number){return 450+Math.min(100,uncertainty*.5);}
function approachExitRadius(uncertainty:number){return 600+Math.min(100,uncertainty*.5);}
/** Accuracy-aware registered-place match for stay/journal projections. The UNKNOWN band avoids boundary jitter. */
export function placePresence(point:LocationPoint,place:KnownLocationPlace):'IN'|'OUT'|'UNKNOWN'{
  const uncertainty=placeUncertainty(point,place);if(uncertainty===null)return 'UNKNOWN';
  const distance=locationDistance(point,place);
  return distance<=insideRadius(uncertainty)?'IN':distance>insideExitRadius(uncertainty)?'OUT':'UNKNOWN';
}
/** Stateful proximity classification used only for notification transitions. Hysteresis depends on the prior stable phase. */
export function placeProximity(point:LocationPoint,place:KnownLocationPlace,previous:'OUTSIDE'|'APPROACHING'|'INSIDE'='OUTSIDE'):LocationProximityPhase{
  const uncertainty=placeUncertainty(point,place);if(uncertainty===null)return 'UNKNOWN';
  const distance=locationDistance(point,place);
  const inLimit=previous==='INSIDE'?insideExitRadius(uncertainty):insideRadius(uncertainty);
  if(distance<=inLimit)return 'INSIDE';
  const nearLimit=previous==='APPROACHING'?approachExitRadius(uncertainty):approachRadius(uncertainty);
  return distance<=nearLimit?'APPROACHING':'OUTSIDE';
}
export type StayReportEntry={kind:'STAY'|'MOVE'|'GAP'|'UNCERTAIN';from:string;to:string;minutes:number;place:string;meters?:number;anchor?:{latitude:number;longitude:number}};
type InternalStayReportEntry=StayReportEntry&{knownPlaceKey?:string;unknownAnchor?:LocationPoint};
const UNKNOWN_STAY_CLUSTER_METERS=120;
const MAX_STAY_POINT_ACCURACY_METERS=150;
const STAY_MERGE_GAP_MS=5*60*1000;
const reliablePoint=(point:LocationPoint)=>Number.isFinite(point.accuracyMeters)&&Number(point.accuracyMeters)>=0&&Number(point.accuracyMeters)<=MAX_STAY_POINT_ACCURACY_METERS;
const publicAnchor=(point:LocationPoint)=>({latitude:point.latitude,longitude:point.longitude});
function mergeShortStayGaps(entries:InternalStayReportEntry[]):InternalStayReportEntry[]{
  const merged:InternalStayReportEntry[]=[];
  for(const entry of entries){
    if(entry.kind!=='STAY'){merged.push(entry);continue;}
    let priorIndex=merged.length-1;
    while(priorIndex>=0&&merged[priorIndex].kind!=='STAY')priorIndex--;
    const prior=priorIndex>=0?merged[priorIndex]:undefined;
    if(!prior){merged.push(entry);continue;}
    const gapMs=Date.parse(entry.from)-Date.parse(prior.to);
    const intervening=merged.slice(priorIndex+1);
    const shortGap=Number.isFinite(gapMs)&&gapMs>=0&&gapMs<=STAY_MERGE_GAP_MS;
    const safeGap=intervening.every(item=>item.kind==='UNCERTAIN'||item.kind==='GAP');
    const sameKnown=Boolean(prior.knownPlaceKey&&entry.knownPlaceKey&&prior.knownPlaceKey===entry.knownPlaceKey);
    const sameUnknown=Boolean(!prior.knownPlaceKey&&!entry.knownPlaceKey&&prior.unknownAnchor&&entry.unknownAnchor&&locationDistance(prior.unknownAnchor,entry.unknownAnchor)<=UNKNOWN_STAY_CLUSTER_METERS);
    if(shortGap&&safeGap&&(sameKnown||sameUnknown)){
      const gapMinutes=Math.max(0,Math.floor(gapMs/60000));
      merged.splice(priorIndex+1);
      prior.to=entry.to;
      prior.minutes+=gapMinutes+entry.minutes;
      continue;
    }
    merged.push(entry);
  }
  return merged;
}
/** Observations only: never infer travel mode, street address or time outside the sampled interval. */
export function buildLocationStayReport(points:readonly LocationPoint[],places:readonly KnownLocationPlace[]):StayReportEntry[]{
  const entries:InternalStayReportEntry[]=[];
  let stayAnchor:LocationPoint|undefined;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],duration=Date.parse(b.recordedAt)-Date.parse(a.recordedAt);
    if(!Number.isFinite(duration)||duration<=0)continue;
    const minutes=Math.floor(duration/60000);if(!minutes)continue;
    const start=places.find(p=>placePresence(a,p)==='IN'),end=places.find(p=>placePresence(b,p)==='IN');
    const accurate=Number.isFinite(a.accuracyMeters)&&Number.isFinite(b.accuracyMeters)&&Number(a.accuracyMeters)<=100&&Number(b.accuracyMeters)<=100;
    const meters=Math.max(0,locationDistance(a,b)-Number(a.accuracyMeters||0)-Number(b.accuracyMeters||0));
    let kind:StayReportEntry['kind']='UNCERTAIN',place='場所・移動を判定できません',knownPlaceKey:string|undefined,unknownAnchor:LocationPoint|undefined;
    if(duration>30*60000){kind='GAP';place='位置記録の空白';stayAnchor=undefined;}
    else if(start&&end&&start.key===end.key){kind='STAY';place=start.label;knownPlaceKey=start.key;stayAnchor=undefined;}
    else if(accurate&&meters>=100){kind='MOVE';place=(start?.label||'未登録地点')+' → '+(end?.label||'未登録地点');stayAnchor=undefined;}
    else{
      const pairStable=accurate&&locationDistance(a,b)<=50;
      if(!stayAnchor&&pairStable)stayAnchor=a;
      const clusterStable=Boolean(stayAnchor&&reliablePoint(b)&&locationDistance(stayAnchor,b)<=UNKNOWN_STAY_CLUSTER_METERS);
      if(pairStable||clusterStable){kind='STAY';place='未登録地点付近';unknownAnchor=stayAnchor||a;if(!stayAnchor)stayAnchor=unknownAnchor;}
    }
    const previous=entries.at(-1);
    const bridgeableUncertain=Boolean(previous&&previous.kind==='UNCERTAIN'&&entries.length>=2&&entries.at(-2)?.kind==='STAY'&&duration<=10*60*1000);
    const stayPrevious=bridgeableUncertain?entries.at(-2):previous;
    const contiguous=Boolean(stayPrevious&&stayPrevious.kind==='STAY'&&kind==='STAY'&&(stayPrevious.to===a.recordedAt||bridgeableUncertain));
    const sameKnown=Boolean(contiguous&&knownPlaceKey&&stayPrevious?.knownPlaceKey===knownPlaceKey);
    const sameUnknown=Boolean(contiguous&&!knownPlaceKey&&!stayPrevious?.knownPlaceKey&&stayPrevious?.unknownAnchor&&unknownAnchor&&locationDistance(stayPrevious.unknownAnchor,unknownAnchor)<=UNKNOWN_STAY_CLUSTER_METERS);
    if(stayPrevious&&(sameKnown||sameUnknown)){
      if(bridgeableUncertain){const uncertain=entries.pop();if(uncertain)stayPrevious.minutes+=uncertain.minutes;}
      stayPrevious.to=b.recordedAt;
      stayPrevious.minutes+=minutes;
    }else{
      entries.push({kind,from:a.recordedAt,to:b.recordedAt,minutes,place,...(kind==='MOVE'?{meters:Math.round(meters)}:{}),...(knownPlaceKey?{knownPlaceKey}:{}),...(unknownAnchor?{unknownAnchor,anchor:publicAnchor(unknownAnchor)}:{})});
    }
  }
  return mergeShortStayGaps(entries).map(({knownPlaceKey:_knownPlaceKey,unknownAnchor:_unknownAnchor,...entry})=>entry);
}
