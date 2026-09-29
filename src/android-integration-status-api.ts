import type {AppContext} from './app-context';
import {json} from './response';
import {DEFAULT_FAMILY_TIMEZONE,formatStoredUtcForFamily} from './timezone';

type Row=Record<string,unknown>;
const headers={'cache-control':'private, no-store'};

/** On-demand status only. Never return OAuth tokens, calendar IDs or raw provider errors. */
export async function androidIntegrationStatusApi(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{...headers,allow:'GET'});
  const member=ctx.member;
  if(!member)return json({ok:false,code:'AUTH_REQUIRED'},401,headers);
  const familyId=Number(member.family_id),memberId=Number(member.id);
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(memberId)||memberId<=0)
    return json({ok:false,code:'FORBIDDEN'},403,headers);
  const [calendar,linked,tasks]=await Promise.all([
    ctx.env.DB.prepare("SELECT status FROM external_calendar_accounts WHERE family_id=? AND provider='GOOGLE_CALENDAR' LIMIT 1")
      .bind(familyId).first<Row>(),
    ctx.env.DB.prepare("SELECT MAX(last_synced_at) last_sync FROM external_calendar_links WHERE family_id=? AND provider='GOOGLE_CALENDAR' AND deleted_at IS NULL")
      .bind(familyId).first<Row>(),
    ctx.env.DB.prepare("SELECT status,last_sync_at,conflict_count FROM external_google_task_accounts WHERE family_id=? AND member_id=? LIMIT 1")
      .bind(familyId,memberId).first<Row>(),
  ]);
  const timeZone=String(member.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);
  return json({ok:true,calendar:{status:String(calendar?.status||'DISCONNECTED'),
      lastOutboundAt:formatStoredUtcForFamily(linked?.last_sync==null?null:String(linked.last_sync),timeZone)},
    tasks:{status:String(tasks?.status||'DISCONNECTED'),
      lastSyncAt:formatStoredUtcForFamily(tasks?.last_sync_at==null?null:String(tasks.last_sync_at),timeZone),
      conflictCount:Number(tasks?.conflict_count||0)}},200,headers);
}
