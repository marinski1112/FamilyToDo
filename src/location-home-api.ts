import type { AppContext } from './app-context';
import { D1LocationQueryService } from './location-query-service';
import { constantTimeEqual } from './security';
import { json } from './response';

type HomeRow=Readonly<{
  label:unknown;
  captured_from_member_id:unknown;
  source_recorded_at:unknown;
  updated_at:unknown;
}>;
type MemberRow=Readonly<{id:unknown;name:unknown}>;

const MAX_LOCATION_AGE_MS=30*60*1000;
const MAX_BODY_BYTES=2048;
const isPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;

function fail(status:number,code:string,message:string):Response{
  return json({ok:false,error:message,code},status,{'cache-control':'no-store'});
}
function isAdminRole(value:unknown):boolean{
  const role=String(value??'').toUpperCase();
  return role==='OWNER'||role==='ADMIN';
}
function freshEnough(recordedAt:string,nowMs:number):boolean{
  const recordedMs=Date.parse(recordedAt);
  return Number.isFinite(recordedMs)&&recordedMs<=nowMs+60_000&&nowMs-recordedMs<=MAX_LOCATION_AGE_MS;
}
async function readHome(ctx:AppContext,familyId:number):Promise<Response>{
  const row=await ctx.env.DB.prepare(`
    SELECT p.label,p.captured_from_member_id,p.source_recorded_at,p.updated_at
    FROM family_location_places p
    WHERE p.family_id=? AND p.kind='HOME'
    LIMIT 1
  `).bind(familyId).first<HomeRow>();
  if(!row)return json({ok:true,configured:false},200,{'cache-control':'no-store'});
  const sourceMemberId=Number(row.captured_from_member_id);
  const source=isPositiveId(sourceMemberId)
    ?await ctx.env.DB.prepare('SELECT id,name FROM members WHERE id=? AND family_id=? LIMIT 1').bind(sourceMemberId,familyId).first<MemberRow>()
    :null;
  return json({
    ok:true,
    configured:true,
    label:String(row.label??'自宅'),
    sourceMemberName:source?String(source.name??''):null,
    sourceRecordedAt:row.source_recorded_at?String(row.source_recorded_at):null,
    updatedAt:row.updated_at?String(row.updated_at):null,
  },200,{'cache-control':'no-store'});
}

/** OWNER/ADMIN-only HOME management. A HOME point can only be captured from an
 * existing sharing-enabled provider-neutral latest location; the browser never
 * submits coordinates and no reverse-geocoding or provider payload is stored. */
export async function locationHomeApi(request:Request,ctx:AppContext):Promise<Response>{
  const requester=ctx.member;
  if(!requester)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  const familyId=Number(requester.family_id);
  const requesterMemberId=Number(requester.id);
  if(!isPositiveId(familyId)||!isPositiveId(requesterMemberId))return fail(403,'FORBIDDEN','操作できません。');
  if(!isAdminRole(requester.role))return fail(403,'ADMIN_REQUIRED','管理者のみ自宅地点を変更できます。');

  if(request.method==='GET')return readHome(ctx,familyId);
  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');
  const csrf=request.headers.get('x-csrf-token');
  if(!ctx.session.csrfToken||!csrf||!constantTimeEqual(ctx.session.csrfToken,csrf))return fail(403,'CSRF_FAILED','操作を確認できませんでした。');
  const declaredLength=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declaredLength)&&declaredLength>MAX_BODY_BYTES)return fail(413,'PAYLOAD_TOO_LARGE','入力が大きすぎます。');

  let body:{action?:unknown;sourceMemberId?:unknown};
  try{body=await request.json() as {action?:unknown;sourceMemberId?:unknown};}catch{return fail(400,'BAD_REQUEST','入力を確認できませんでした。');}
  const action=String(body.action??'').trim().toLowerCase();
  if(action==='delete'){
    await ctx.env.DB.prepare("DELETE FROM family_location_places WHERE family_id=? AND kind='HOME'").bind(familyId).run();
    return json({ok:true,configured:false},200,{'cache-control':'no-store'});
  }
  if(action!=='capture')return fail(400,'BAD_ACTION','操作を確認できませんでした。');

  const sourceMemberId=Number(body.sourceMemberId);
  if(!isPositiveId(sourceMemberId))return fail(400,'BAD_SOURCE','対象メンバーを確認できませんでした。');
  const source=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL LIMIT 1').bind(sourceMemberId,familyId).first<MemberRow>();
  if(!source)return fail(404,'SOURCE_NOT_FOUND','対象メンバーを確認できませんでした。');

  const service=new D1LocationQueryService(ctx.env.DB);
  const point=await service.latest({scope:{familyId,requesterMemberId},subjectMemberId:sourceMemberId});
  if(!point)return fail(409,'SOURCE_LOCATION_UNAVAILABLE','このメンバーの共有中の位置情報がありません。');
  if(!freshEnough(point.recordedAt,Date.now()))return fail(409,'SOURCE_LOCATION_STALE','このメンバーの位置情報が古いため、自宅地点として保存できません。');

  await ctx.env.DB.prepare(`
    INSERT INTO family_location_places(
      family_id,kind,label,latitude,longitude,accuracy_meters,captured_from_member_id,
      source_recorded_at,created_by_member_id,updated_by_member_id,created_at,updated_at
    ) VALUES(?,'HOME','自宅',?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(family_id,kind) DO UPDATE SET
      label='自宅',latitude=excluded.latitude,longitude=excluded.longitude,
      accuracy_meters=excluded.accuracy_meters,captured_from_member_id=excluded.captured_from_member_id,
      source_recorded_at=excluded.source_recorded_at,updated_by_member_id=excluded.updated_by_member_id,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    familyId,point.latitude,point.longitude,point.accuracyMeters??null,sourceMemberId,
    point.recordedAt,requesterMemberId,requesterMemberId,
  ).run();
  return readHome(ctx,familyId);
}
