import type {AppContext} from './app-context';
import {json} from './response';
import {constantTimeEqual} from './security';
import {D1LocationQueryService} from './location-query-service';
import type {KnownLocationPlace} from './location-stay-report';
import {webPushConfigured} from './webpush';

export async function readKnownLocationPlaces(db:D1Database,familyId:number):Promise<KnownLocationPlace[]>{
  const rows=await db.prepare(`SELECT 'H:'||id AS place_key,label,latitude,longitude,accuracy_meters,updated_at FROM family_location_places WHERE family_id=? AND kind='HOME'
    UNION ALL SELECT 'N:'||id AS place_key,label,latitude,longitude,accuracy_meters,updated_at FROM family_location_named_places WHERE family_id=? LIMIT 13`).bind(familyId,familyId).all<Record<string,unknown>>();
  return rows.results.map(r=>({key:String(r.place_key),label:String(r.label),latitude:Number(r.latitude),longitude:Number(r.longitude),accuracyMeters:r.accuracy_meters==null?NaN:Number(r.accuracy_meters),version:String(r.updated_at)}));
}
export async function locationPlacesApi(request:Request,ctx:AppContext):Promise<Response>{
  const familyId=Number(ctx.member?.family_id),memberId=Number(ctx.member?.id);
  const reply=(body:unknown,status=200)=>json(body,status,{'cache-control':'no-store'});
  if(!Number.isSafeInteger(familyId)||!Number.isSafeInteger(memberId)||familyId<=0||memberId<=0)return reply({ok:false,error:'ログインが必要です。'},401);
  const actor=await ctx.env.DB.prepare('SELECT role FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(memberId,familyId).first<{role:string}>();
  if(!actor)return reply({ok:false,error:'参照できません。'},403);
  if(request.method==='GET'){
    const places=await readKnownLocationPlaces(ctx.env.DB,familyId);
    const pref=await ctx.env.DB.prepare('SELECT enabled FROM location_arrival_preferences WHERE family_id=? AND member_id=?').bind(familyId,memberId).first<{enabled:number}>();
    const sub=await ctx.env.DB.prepare('SELECT id FROM web_push_subscriptions WHERE family_id=? AND member_id=? AND enabled=1 LIMIT 1').bind(familyId,memberId).first();
    const recent=await ctx.env.DB.prepare('SELECT status,created_at FROM location_arrival_deliveries WHERE family_id=? AND recipient_id=? ORDER BY id DESC LIMIT 5').bind(familyId,memberId).all();
    return reply({ok:true,places:places.map(p=>({key:p.key,label:p.label})),enabled:pref?.enabled===1,pushReady:webPushConfigured(ctx.env)&&Boolean(sub),recent:recent.results});
  }
  if(request.method!=='POST')return reply({ok:false,error:'操作できません。'},405);
  const csrf=request.headers.get('x-csrf-token')||'';
  if(!csrf||!ctx.session.csrfToken||!constantTimeEqual(csrf,ctx.session.csrfToken))return reply({ok:false,error:'操作を確認できませんでした。'},403);
  const reader=request.body?.getReader();if(!reader)return reply({ok:false,error:'入力がありません。'},400);
  let size=0,text='';const decoder=new TextDecoder();
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return reply({ok:false,error:'入力が大きすぎます。'},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  let body:{action?:string;enabled?:boolean;label?:string;sourceMemberId?:number;key?:string};
  try{body=JSON.parse(text);}catch{return reply({ok:false,error:'入力を確認してください。'},400);}
  if(!body||typeof body!=='object')return reply({ok:false,error:'入力を確認してください。'},400);
  if(body.action==='preference'){
    if(typeof body.enabled!=='boolean')return reply({ok:false,error:'通知設定を確認してください。'},400);
    const result=await ctx.env.DB.prepare(`INSERT INTO location_arrival_preferences(family_id,member_id,enabled) SELECT ?,?,? WHERE ?=0 OR (SELECT COUNT(*) FROM location_arrival_preferences WHERE family_id=? AND enabled=1 AND member_id<>?)<4 ON CONFLICT(family_id,member_id) DO UPDATE SET enabled=excluded.enabled`).bind(familyId,memberId,body.enabled?1:0,body.enabled?1:0,familyId,memberId).run();
    if(!Number(result.meta.changes))return reply({ok:false,error:'到着通知の受信者は家族4人までです。'},409);
    return reply({ok:true});
  }
  if(!['OWNER','ADMIN'].includes(String(actor.role).toUpperCase()))return reply({ok:false,error:'拠点変更は管理者のみ操作できます。'},403);
  if(body.action==='delete'){
    if(typeof body.key!=='string'||!/^N:[1-9]\d*$/.test(body.key))return reply({ok:false,error:'自宅は自宅地点の設定から解除してください。'},400);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('DELETE FROM family_location_named_places WHERE family_id=? AND id=?').bind(familyId,Number(body.key.slice(2))),
      ctx.env.DB.prepare('DELETE FROM location_arrival_states WHERE family_id=? AND place_key=?').bind(familyId,body.key),
    ]);return reply({ok:true});
  }
  const label=typeof body.label==='string'?body.label.trim():'';
  const sourceMemberId=Number(body.sourceMemberId);
  if(body.action!=='capture'||!label||label.length>40||/[\r\n\x00-\x1f]/.test(label)||!Number.isSafeInteger(sourceMemberId)||sourceMemberId<=0)return reply({ok:false,error:'拠点名と取得元を確認してください。'},400);
  const point=await new D1LocationQueryService(ctx.env.DB).latest({scope:{familyId,requesterMemberId:memberId},subjectMemberId:sourceMemberId});
  const age=point?Date.now()-Date.parse(point.recordedAt):Infinity;
  if(!point||age>10*60000||age< -60000||point.accuracyMeters===undefined||point.accuracyMeters>100)return reply({ok:false,error:'10分以内・精度100m以内の共有位置が必要です。拠点にいるメンバーから位置を送信してください。'},409);
  const existing=await ctx.env.DB.prepare('SELECT id FROM family_location_named_places WHERE family_id=? AND label=?').bind(familyId,label).first();
  if(existing)return reply({ok:false,error:'同じ名前の拠点があります。変更する場合は削除して登録し直してください。'},409);
  const result=await ctx.env.DB.prepare(`INSERT INTO family_location_named_places(family_id,label,latitude,longitude,accuracy_meters,updated_at)
    SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM family_location_named_places WHERE family_id=?)<12`).bind(familyId,label,point.latitude,point.longitude,point.accuracyMeters,new Date().toISOString(),familyId).run();
  return Number(result.meta.changes)>0?reply({ok:true}):reply({ok:false,error:'追加拠点は12か所までです。'},409);
}
