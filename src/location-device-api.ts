import type { AppContext } from './app-context';
import { provisionLocationDevice } from './location-device-provisioning';
import type { LocationProvider } from './location-domain';
import { bodyJson, RequestBodyParseError } from './request-body';
import { commitSession } from './session';
import { json } from './response';

type DeviceRow=Readonly<{
  id:unknown;
  member_id:unknown;
  enabled:unknown;
  sharing_enabled:unknown;
  revoked_at:unknown;
}>;
type DeviceListRow=Readonly<{
  id:unknown;
  public_id:unknown;
  member_id:unknown;
  member_name:unknown;
  provider:unknown;
  enabled:unknown;
  sharing_enabled:unknown;
  revoked_at:unknown;
  last_seen_at:unknown;
  created_at:unknown;
}>;

const isPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;
const isAdminRole=(value:unknown):boolean=>{
  const role=String(value??'').toUpperCase();
  return role==='OWNER'||role==='ADMIN';
};
const locationProvider=(value:unknown):LocationProvider|null=>
  value==='OWNTRACKS'||value==='FAMILYTODO_ANDROID'?value:null;

function bad(message:string):Response{
  return json({ok:false,error:message,code:'BAD_REQUEST'},400,{'cache-control':'no-store'});
}
function fail(status:number,code:string,message:string):Response{
  return json({ok:false,error:message,code},status,{'cache-control':'no-store'});
}

/**
 * Authenticated device-management boundary for Location sensors.
 * Plaintext provisioning secrets are returned once and are never read back from D1.
 * Existing devices may be managed only by their member or a same-family OWNER/ADMIN.
 */
export async function locationDeviceApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return fail(401,'AUTH_REQUIRED','ログインが必要です。');

  const familyId=Number(member.family_id);
  const actorMemberId=Number(member.id);
  if(!isPositiveId(familyId)||!isPositiveId(actorMemberId))return fail(403,'FORBIDDEN','操作できません。');

  if(request.method==='GET'){
    const admin=isAdminRole(member.role);
    const sql=`
      SELECT d.id,d.public_id,d.member_id,m.name AS member_name,d.provider,d.enabled,d.sharing_enabled,d.revoked_at,d.last_seen_at,d.created_at
      FROM location_devices d
      JOIN members m ON m.id=d.member_id AND m.family_id=d.family_id
      WHERE d.family_id=?${admin?'':' AND d.member_id=?'}
      ORDER BY d.revoked_at IS NOT NULL,d.enabled DESC,d.id DESC
    `;
    const statement=ctx.env.DB.prepare(sql);
    const result=admin
      ?await statement.bind(familyId).all<DeviceListRow>()
      :await statement.bind(familyId,actorMemberId).all<DeviceListRow>();
    return json({
      ok:true,
      devices:result.results.map(row=>({
        id:Number(row.id),
        publicId:String(row.public_id??''),
        memberId:Number(row.member_id),
        memberName:String(row.member_name??''),
        provider:String(row.provider??''),
        enabled:Number(row.enabled)===1,
        sharingEnabled:Number(row.sharing_enabled)===1,
        revokedAt:row.revoked_at===null||row.revoked_at===undefined?null:String(row.revoked_at),
        lastSeenAt:row.last_seen_at===null||row.last_seen_at===undefined?null:String(row.last_seen_at),
        createdAt:row.created_at===null||row.created_at===undefined?null:String(row.created_at),
      })),
    },200,{'cache-control':'no-store'});
  }

  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');

  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}
  catch(error){
    if(error instanceof RequestBodyParseError)return bad(error.message||'入力内容が不正です。');
    throw error;
  }

  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof body.csrf!=='string'||body.csrf!==ctx.session.csrfToken){
    return fail(403,'FORBIDDEN','CSRF検証に失敗しました。');
  }

  if(body.action==='provision'){
    const targetMemberId=body.member_id===undefined?actorMemberId:Number(body.member_id);
    const provider=locationProvider(body.provider);
    if(!isPositiveId(targetMemberId)||!provider)return bad('端末情報が不正です。');
    try{
      const device=await provisionLocationDevice(ctx.env.DB,{
        familyId,
        memberId:targetMemberId,
        createdByMemberId:actorMemberId,
        provider,
      });
      return commitSession(json({
        ok:true,
        device:{
          id:device.id,
          publicId:device.publicId,
          secret:device.secret,
          memberId:device.memberId,
          provider:device.provider,
          sharingEnabled:false,
        },
      },200,{'cache-control':'no-store'}),ctx.session,ctx.env.APP_SECRET);
    }catch(error){
      const code=error instanceof Error?error.message:'';
      if(code==='LOCATION_DEVICE_PROVISIONING_FORBIDDEN')return fail(403,'FORBIDDEN','操作できません。');
      if(code==='LOCATION_DEVICE_MEMBER_NOT_FOUND')return fail(404,'NOT_FOUND','対象メンバーが見つかりません。');
      if(code==='INVALID_LOCATION_DEVICE_PROVISIONING_REQUEST')return bad('端末情報が不正です。');
      throw error;
    }
  }

  const deviceId=Number(body.device_id);
  if(!isPositiveId(deviceId))return bad('端末IDが不正です。');
  const device=await ctx.env.DB.prepare(`
    SELECT id,member_id,enabled,sharing_enabled,revoked_at
    FROM location_devices
    WHERE id=? AND family_id=?
    LIMIT 1
  `).bind(deviceId,familyId).first<DeviceRow>();
  if(!device)return fail(404,'NOT_FOUND','端末が見つかりません。');

  const targetMemberId=Number(device.member_id);
  if(!isPositiveId(targetMemberId)||(targetMemberId!==actorMemberId&&!isAdminRole(member.role))){
    return fail(403,'FORBIDDEN','操作できません。');
  }

  if(body.action==='sharing'){
    if(typeof body.enabled!=='boolean')return bad('共有状態が不正です。');
    if(device.revoked_at!==null&&device.revoked_at!==undefined)return fail(409,'DEVICE_REVOKED','失効済み端末です。');
    if(Number(device.enabled)!==1)return fail(409,'DEVICE_DISABLED','無効な端末です。');
    const sharingEnabled=body.enabled?1:0;
    const result=await ctx.env.DB.prepare(`
      UPDATE location_devices
      SET sharing_enabled=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND family_id=? AND member_id=? AND enabled=1 AND revoked_at IS NULL
    `).bind(sharingEnabled,deviceId,familyId,targetMemberId).run();
    if(Number(result.meta?.changes??0)!==1)return fail(409,'DEVICE_STATE_CHANGED','端末状態が変更されました。');
    return commitSession(json({ok:true,deviceId,sharingEnabled:body.enabled},200,{'cache-control':'no-store'}),ctx.session,ctx.env.APP_SECRET);
  }

  if(body.action==='revoke'){
    await ctx.env.DB.prepare(`
      UPDATE location_devices
      SET sharing_enabled=0,enabled=0,revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND family_id=? AND member_id=?
    `).bind(deviceId,familyId,targetMemberId).run();
    return commitSession(json({ok:true,deviceId,revoked:true,sharingEnabled:false},200,{'cache-control':'no-store'}),ctx.session,ctx.env.APP_SECRET);
  }

  return bad('操作が不正です。');
}
