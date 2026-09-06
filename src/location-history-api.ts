import type { AppContext } from './app-context';
import { D1LocationQueryService } from './location-query-service';
import { json } from './response';

const HISTORY_LIMIT=250;
const MAX_HISTORY_WINDOW_MS=48*60*60*1000;

const isPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;
const canonicalIso=(value:string):boolean=>{
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString()===value;
};

function fail(status:number,code:string,message:string):Response{
  return json({ok:false,error:message,code},status,{'cache-control':'no-store'});
}

/**
 * Browser-safe authenticated Location history projection.
 *
 * This endpoint deliberately reuses D1LocationQueryService.history() so family
 * membership, active-member state and device sharing/revoke checks remain at
 * the provider-neutral read boundary. Only coordinates, sensor time and
 * optional accuracy are returned. Device/provider identifiers, raw provider
 * payloads and credentials are never exposed.
 */
export async function locationHistoryApi(request:Request,ctx:AppContext):Promise<Response>{
  const requester=ctx.member;
  if(!requester)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');

  const familyId=Number(requester.family_id);
  const requesterMemberId=Number(requester.id);
  if(!isPositiveId(familyId)||!isPositiveId(requesterMemberId))return fail(403,'FORBIDDEN','参照できません。');

  const url=new URL(request.url);
  const subjectMemberId=Number(url.searchParams.get('memberId')||'');
  const from=String(url.searchParams.get('from')||'').trim();
  const to=String(url.searchParams.get('to')||'').trim();
  if(!isPositiveId(subjectMemberId))return fail(400,'INVALID_MEMBER','memberId が不正です。');
  if(!canonicalIso(from)||!canonicalIso(to))return fail(400,'INVALID_RANGE','from / to はISO日時で指定してください。');

  const fromMs=Date.parse(from),toMs=Date.parse(to);
  if(fromMs>toMs||toMs-fromMs>MAX_HISTORY_WINDOW_MS)return fail(400,'INVALID_RANGE','参照期間は48時間以内で指定してください。');

  const service=new D1LocationQueryService(ctx.env.DB);
  const points=await service.history({
    scope:{familyId,requesterMemberId},
    subjectMemberId,
    from,
    to,
    limit:HISTORY_LIMIT,
  });

  return json({
    ok:true,
    memberId:subjectMemberId,
    from,
    to,
    limit:HISTORY_LIMIT,
    points:points.map((point)=>({
      latitude:point.latitude,
      longitude:point.longitude,
      recordedAt:point.recordedAt,
      ...(point.accuracyMeters===undefined?{}:{accuracyMeters:point.accuracyMeters}),
    })),
  },200,{'cache-control':'no-store'});
}
