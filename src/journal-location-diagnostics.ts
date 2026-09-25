import type {AppContext} from './app-context';
import {json} from './response';
import {DEFAULT_FAMILY_TIMEZONE,familyNow} from './timezone';

type Row=Record<string,unknown>;
const dayBefore=(value:string)=>{const day=new Date(`${value}T12:00:00Z`);day.setUTCDate(day.getUTCDate()-1);return day.toISOString().slice(0,10);};
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Admin-only, family-scoped counts. Never return places, coordinates or journal text. */
export async function journalLocationDiagnostics(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,error:'ログインが必要です。'},401);
  if(!['OWNER','ADMIN'].includes(String(member.role||'').toUpperCase()))return json({ok:false,error:'管理者権限が必要です。'},403);
  if(request.method!=='GET')return json({ok:false,error:'GET only'},405);
  const familyId=Number(member.family_id),timezone=String(member.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);
  const yesterday=dayBefore(familyNow(timezone).slice(0,10));
  const date=new URL(request.url).searchParams.get('date')||yesterday;
  if(!validDate(date)||date>yesterday)return json({ok:false,error:'日付が不正です。'},400);
  // The ingestion and archive paths both use JST days. Use the family/time
  // index over canonical UTC instants; never select coordinates or payloads.
  const start=Date.parse(`${date}T00:00:00+09:00`);
  const from=new Date(start).toISOString(),until=new Date(start+86400000).toISOString();
  const [raw,quality,archive,stays,journal]=await Promise.all([
    ctx.env.DB.prepare(`SELECT COALESCE(SUM(points),0) points,COUNT(*) members,COALESCE(MAX(points),0) max_points_per_member,
      SUM(CASE WHEN points>10000 THEN 1 ELSE 0 END) over_archive_limit_members
      FROM (SELECT COUNT(*) points FROM member_location_history
        WHERE family_id=? AND recorded_at>=? AND recorded_at<? GROUP BY member_id)`)
      .bind(familyId,from,until).first<Row>(),
    // The stay classifier skips pairs shorter than one minute and gaps over
    // thirty minutes. Report only aggregate eligibility, never GPS samples.
    ctx.env.DB.prepare(`SELECT COUNT(*) points,
      SUM(CASE WHEN accuracy_meters IS NOT NULL AND accuracy_meters>=0 AND accuracy_meters<=100 THEN 1 ELSE 0 END) accuracy_le_100,
      SUM(CASE WHEN accuracy_meters IS NOT NULL AND accuracy_meters>=0 AND accuracy_meters<=150 THEN 1 ELSE 0 END) accuracy_le_150,
      SUM(CASE WHEN previous_at IS NOT NULL AND elapsed_seconds>0 AND elapsed_seconds<60 THEN 1 ELSE 0 END) pairs_under_one_minute,
      SUM(CASE WHEN previous_at IS NOT NULL AND elapsed_seconds>=60 AND elapsed_seconds<=1800 THEN 1 ELSE 0 END) pairs_one_to_thirty_minutes,
      SUM(CASE WHEN previous_at IS NOT NULL AND elapsed_seconds>1800 THEN 1 ELSE 0 END) pairs_over_thirty_minutes
      FROM (SELECT accuracy_meters,previous_at,
        (julianday(recorded_at)-julianday(previous_at))*86400 elapsed_seconds
        FROM (SELECT accuracy_meters,recorded_at,
          LAG(recorded_at) OVER (PARTITION BY member_id ORDER BY recorded_at,id) previous_at
          FROM member_location_history WHERE family_id=? AND recorded_at>=? AND recorded_at<?))`)
      .bind(familyId,from,until).first<Row>(),
    ctx.env.DB.prepare(`SELECT COUNT(*) archive_members,COALESCE(SUM(a.raw_point_count),0) raw_points,COALESCE(SUM(a.route_point_count),0) route_points,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM members m JOIN location_devices d ON d.member_id=m.id AND d.family_id=m.family_id
        WHERE m.id=a.member_id AND m.family_id=a.family_id AND m.active=1 AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL) THEN 1 ELSE 0 END) currently_shared_members
      FROM location_history_archive_days a WHERE a.family_id=? AND a.local_date=?`).bind(familyId,date).first<Row>(),
    ctx.env.DB.prepare('SELECT COUNT(*) stays FROM location_history_stays WHERE family_id=? AND local_date=?').bind(familyId,date).first<Row>(),
    ctx.env.DB.prepare(`SELECT id,generated_at,content_version,ai_status,ai_source_content_version,
      CASE WHEN json_valid(location_json) THEN json_array_length(location_json) ELSE 0 END saved_members,
      CASE WHEN json_valid(location_json) THEN
        (SELECT COUNT(*) FROM json_each(location_json) member, json_each(member.value,'$.stays')) ELSE 0 END saved_stays
      ,CASE WHEN json_valid(location_json) THEN
        (SELECT COUNT(*) FROM json_each(location_json) entry WHERE EXISTS
          (SELECT 1 FROM members m JOIN location_devices d ON d.member_id=m.id AND d.family_id=m.family_id
            WHERE m.family_id=family_daily_journals.family_id AND m.id=CAST(json_extract(entry.value,'$.memberId') AS INTEGER)
              AND m.active=1 AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL)) ELSE 0 END visible_members
      FROM family_daily_journals WHERE family_id=? AND journal_date=? AND storage_tier='HOT' LIMIT 1`).bind(familyId,date).first<Row>(),
  ]);
  return json({ok:true,date,raw_history_points:Number(raw?.points||0),raw_history_members:Number(raw?.members||0),raw_history_max_points_per_member:Number(raw?.max_points_per_member||0),raw_history_members_over_archive_limit:Number(raw?.over_archive_limit_members||0),raw_accuracy_le_100:Number(quality?.accuracy_le_100||0),raw_accuracy_le_150:Number(quality?.accuracy_le_150||0),raw_pairs_under_one_minute:Number(quality?.pairs_under_one_minute||0),raw_pairs_one_to_thirty_minutes:Number(quality?.pairs_one_to_thirty_minutes||0),raw_pairs_over_thirty_minutes:Number(quality?.pairs_over_thirty_minutes||0),archive_members:Number(archive?.archive_members||0),archive_raw_points:Number(archive?.raw_points||0),archive_route_points:Number(archive?.route_points||0),archive_members_currently_shared:Number(archive?.currently_shared_members||0),archive_stays:Number(stays?.stays||0),journal_exists:!!journal,journal_id:journal?Number(journal.id):null,journal_generated_at:journal?String(journal.generated_at||''):null,journal_content_version:journal?Number(journal.content_version||0):null,journal_saved_members:Number(journal?.saved_members||0),journal_saved_stays:Number(journal?.saved_stays||0),journal_visible_members:Number(journal?.visible_members||0),journal_ai_status:journal?String(journal.ai_status||''):null,journal_ai_source_content_version:journal?.ai_source_content_version==null?null:Number(journal.ai_source_content_version)});
}
