import type { LocationPoint } from './location-providers';

export type KnownLocationPlace={key:string;label:string;latitude:number;longitude:number;accuracyMeters:number;version:string};
export function locationDistance(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}):number{
  const r=Math.PI/180,h=Math.sin((b.latitude-a.latitude)*r/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin((b.longitude-a.longitude)*r/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function placePresence(point:LocationPoint,place:KnownLocationPlace):'IN'|'OUT'|'UNKNOWN'{
  if(!Number.isFinite(point.accuracyMeters)||!Number.isFinite(place.accuracyMeters))return 'UNKNOWN';
  const uncertainty=Number(point.accuracyMeters)+place.accuracyMeters;
  if(uncertainty>150||uncertainty<0)return 'UNKNOWN';
  const distance=locationDistance(point,place);
  return distance+uncertainty<=150?'IN':distance-uncertainty>200?'OUT':'UNKNOWN';
}
export type StayReportEntry={kind:'STAY'|'MOVE'|'GAP'|'UNCERTAIN';from:string;to:string;minutes:number;place:string;meters?:number};
type InternalStayReportEntry=StayReportEntry&{knownPlaceKey?:string;unknownAnchor?:LocationPoint};
const UNKNOWN_STAY_CLUSTER_METERS=120;
/** Observations only: never infer travel mode, street address or time outside the sampled interval. */
export function buildLocationStayReport(points:readonly LocationPoint[],places:readonly KnownLocationPlace[]):StayReportEntry[]{
  const entries:InternalStayReportEntry[]=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],duration=Date.parse(b.recordedAt)-Date.parse(a.recordedAt);
    if(!Number.isFinite(duration)||duration<=0)continue;
    const minutes=Math.floor(duration/60000);if(!minutes)continue;
    const start=places.find(p=>placePresence(a,p)==='IN'),end=places.find(p=>placePresence(b,p)==='IN');
    const accurate=Number.isFinite(a.accuracyMeters)&&Number.isFinite(b.accuracyMeters)&&Number(a.accuracyMeters)<=100&&Number(b.accuracyMeters)<=100;
    const meters=Math.max(0,locationDistance(a,b)-Number(a.accuracyMeters||0)-Number(b.accuracyMeters||0));
    let kind:StayReportEntry['kind']='UNCERTAIN',place='場所・移動を判定できません',knownPlaceKey:string|undefined,unknownAnchor:LocationPoint|undefined;
    if(duration>30*60000){kind='GAP';place='位置記録の空白';}
    else if(start&&end&&start.key===end.key){kind='STAY';place=start.label;knownPlaceKey=start.key;}
    else if(accurate&&meters>=100){kind='MOVE';place=(start?.label||'未登録地点')+' → '+(end?.label||'未登録地点');}
    else if(accurate&&locationDistance(a,b)<=50){kind='STAY';place='未登録地点付近';unknownAnchor=a;}
    const previous=entries.at(-1);
    const contiguous=Boolean(previous&&previous.to===a.recordedAt&&previous.kind==='STAY'&&kind==='STAY');
    const sameKnown=Boolean(contiguous&&knownPlaceKey&&previous?.knownPlaceKey===knownPlaceKey);
    const sameUnknown=Boolean(contiguous&&!knownPlaceKey&&!previous?.knownPlaceKey&&previous?.unknownAnchor&&locationDistance(previous.unknownAnchor,b)<=UNKNOWN_STAY_CLUSTER_METERS);
    if(previous&&(sameKnown||sameUnknown)){
      previous.to=b.recordedAt;
      previous.minutes+=minutes;
    }else{
      entries.push({kind,from:a.recordedAt,to:b.recordedAt,minutes,place,...(kind==='MOVE'?{meters:Math.round(meters)}:{}),...(knownPlaceKey?{knownPlaceKey}:{}),...(unknownAnchor?{unknownAnchor}:{})});
    }
  }
  return entries.map(({knownPlaceKey:_knownPlaceKey,unknownAnchor:_unknownAnchor,...entry})=>entry);
}
