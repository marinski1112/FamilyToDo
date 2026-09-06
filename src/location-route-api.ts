import type { AppContext } from './app-context';
import { constantTimeEqual } from './security';
import { D1LocationQueryService } from './location-query-service';
import { GoogleRoutesProvider } from './location-google-routes';
import { json } from './response';

type MemberRow=Readonly<{id:unknown;name:unknown}>;
const MAX_LOCATION_AGE_MS=30*60*1000;
const MAX_BODY_BYTES=2048;

function fail(status:number,code:string,message:string):Response{
  return json({ok:false,error:message,code},status,{'cache-control':'no-store'});
}
function validId(value:number):boolean{return Number.isSafeInteger(value)&&value>0;}
function freshEnough(recordedAt:string,nowMs:number):boolean{
  const recordedMs=Date.parse(recordedAt);
  return Number.isFinite(recordedMs)&&recordedMs<=nowMs+60_000&&nowMs-recordedMs<=MAX_LOCATION_AGE_MS;
}

/** Paid Routes calls are explicit, authenticated and CSRF-protected. Origin and
 * destination are resolved server-side from sharing-enabled Location records;
 * browsers cannot submit arbitrary coordinates through this endpoint. */
export async function locationRouteEtaApi(request:Request,ctx:AppContext):Promise<Response>{
  const requester=ctx.member;
  if(!requester)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');
  const csrf=request.headers.get('x-csrf-token');
  if(!ctx.session.csrfToken||!csrf||!constantTimeEqual(ctx.session.csrfToken,csrf))return fail(403,'CSRF_FAILED','操作を確認できませんでした。');
  const declaredLength=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declaredLength)&&declaredLength>MAX_BODY_BYTES)return fail(413,'PAYLOAD_TOO_LARGE','入力が大きすぎます。');

  let body:{targetMemberId?:unknown};
  try{body=await request.json() as {targetMemberId?:unknown};}catch{return fail(400,'BAD_REQUEST','対象メンバーを確認できませんでした。');}
  const familyId=Number(requester.family_id);
  const requesterMemberId=Number(requester.id);
  const targetMemberId=Number(body.targetMemberId);
  if(!validId(familyId)||!validId(requesterMemberId)||!validId(targetMemberId)||targetMemberId===requesterMemberId)return fail(400,'BAD_TARGET','対象メンバーを確認できませんでした。');

  const target=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(targetMemberId,familyId).first<MemberRow>();
  if(!target)return fail(404,'MEMBER_NOT_FOUND','対象メンバーを確認できませんでした。');

  const service=new D1LocationQueryService(ctx.env.DB);
  const scope={familyId,requesterMemberId};
  const [origin,destination]=await Promise.all([
    service.latest({scope,subjectMemberId:requesterMemberId}),
    service.latest({scope,subjectMemberId:targetMemberId}),
  ]);
  if(!origin)return fail(409,'VIEWER_LOCATION_UNAVAILABLE','あなたの共有中の位置情報が必要です。');
  if(!destination)return fail(409,'TARGET_LOCATION_UNAVAILABLE','相手の共有中の位置情報がありません。');
  const nowMs=Date.now();
  if(!freshEnough(origin.recordedAt,nowMs))return fail(409,'VIEWER_LOCATION_STALE','あなたの位置情報が古いため、経路時間を計算できません。');
  if(!freshEnough(destination.recordedAt,nowMs))return fail(409,'TARGET_LOCATION_STALE','相手の位置情報が古いため、経路時間を計算できません。');

  const apiKey=String(ctx.env.GOOGLE_MAPS_ROUTES_API_KEY||ctx.env.GOOGLE_MAPS_ROUTE_API_KEY||'').trim();
  if(!apiKey)return fail(503,'ROUTES_NOT_CONFIGURED','経路時間機能はまだ設定されていません。');
  try{
    const route=await new GoogleRoutesProvider(apiKey).route({scope,origin,destination,mode:'drive'});
    return json({ok:true,targetMemberId,targetName:String(target.name??''),mode:'drive',distanceMeters:route.distanceMeters,durationSeconds:route.durationSeconds},200,{'cache-control':'no-store'});
  }catch{
    return fail(502,'ROUTES_UNAVAILABLE','経路時間を取得できませんでした。少し時間をおいて再度お試しください。');
  }
}
