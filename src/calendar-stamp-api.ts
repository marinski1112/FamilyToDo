import {calendarStampFramesForAssets,calendarStampPlacementsForRange} from './calendar-stamps';
import {calendarStampAssetUrl,calendarStampStorageKeyUrl} from './calendar-stamp-asset-url';

export type CalendarStampReadScope={familyId:number;memberId:number};

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

function jsonBody(value:unknown,status=200):Response{
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
}

function validCalendarDate(value:string):boolean{
  if(!DATE_RE.test(value))return false;
  const ms=Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}

/** Read-only browser boundary for the Calendar month stamp UI. */
export async function calendarStampReadApi(request:Request,env:Env,scope:CalendarStampReadScope):Promise<Response>{
  if(request.method!=='GET')return jsonBody({ok:false,error:'GET only'},405);
  if(!Number.isSafeInteger(scope.familyId)||scope.familyId<=0||!Number.isSafeInteger(scope.memberId)||scope.memberId<=0){
    return jsonBody({ok:false,error:'AUTH_REQUIRED'},401);
  }
  const url=new URL(request.url);
  const from=String(url.searchParams.get('from')||'');
  const to=String(url.searchParams.get('to')||'');
  if(!validCalendarDate(from)||!validCalendarDate(to))return jsonBody({ok:false,error:'INVALID_RANGE'},400);

  try{
    const placements=await calendarStampPlacementsForRange(env,scope.familyId,scope.memberId,from,to);
    const frameRead=await calendarStampFramesForAssets(env,scope.familyId,scope.memberId,placements.map(placement=>placement.asset_id));
    const invalidFrameAssets=new Set(frameRead.invalidAssetIds);
    const framesByAsset=new Map<number,typeof frameRead.frames>();
    for(const frame of frameRead.frames){const list=framesByAsset.get(frame.asset_id)||[];list.push(frame);framesByAsset.set(frame.asset_id,list);}
    const stamps=placements.flatMap(placement=>{
      const fullUrl=calendarStampAssetUrl(placement,'full');
      const thumbnailUrl=calendarStampAssetUrl(placement,'thumbnail');
      if(!fullUrl||!thumbnailUrl)return [];
      let frames:{url:string;durationMs:number}[]=[];
      if(placement.asset_kind==='ANIMATED'&&placement.mime_type==='image/png'){
        if(invalidFrameAssets.has(placement.asset_id))return [];
        const rows=framesByAsset.get(placement.asset_id)||[];
        if(rows.length<2||rows.some((frame,index)=>frame.frame_index!==index))return [];
        frames=rows.flatMap(frame=>{
          const frameUrl=calendarStampStorageKeyUrl(placement.storage_provider,frame.storage_key);
          return frameUrl?[{url:frameUrl,durationMs:frame.duration_ms}]:[];
        });
        if(frames.length!==rows.length)return [];
      }
      return [{
        date:placement.stamp_date,
        placementId:placement.placement_id,
        kind:placement.asset_kind,
        mimeType:placement.mime_type,
        thumbnailUrl,
        fullUrl,
        frames,
        width:placement.width,
        height:placement.height,
      }];
    });
    return jsonBody({ok:true,stamps});
  }catch(error){
    const message=String((error as {message?:unknown})?.message||'');
    if(message.includes('range exceeds bound')||message.includes('invalid calendar stamp date'))return jsonBody({ok:false,error:'INVALID_RANGE'},400);
    if(message.includes('member unavailable'))return jsonBody({ok:false,error:'AUTH_REQUIRED'},401);
    return jsonBody({ok:false,error:'STAMP_READ_FAILED'},500);
  }
}
