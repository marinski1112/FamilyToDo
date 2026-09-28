import type {AppContext} from './app-context';
import {IMPORTED_FAMILY_DIARY_SQL} from './imported-family-diary';
import {json} from './response';

type Row=Record<string,unknown>;
const headers={'cache-control':'private, no-store'};

/** Small, family-scoped native timeline; mutations continue through /api/family-log. */
export async function androidFamilyLogApi(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
  const member=ctx.member;
  if(!member)return json({ok:false,code:'AUTH_REQUIRED'},401,headers);
  const date=new URL(request.url).searchParams.get('date')||'';
  if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)
    return json({ok:false,code:'INVALID_DATE'},400,headers);
  const familyId=Number(member.family_id);
  const [subjects,logs,settings]=await Promise.all([
    ctx.env.DB.prepare(`SELECT s.id,s.name,s.subject_kind,s.enabled_types_json FROM family_log_subjects s
      LEFT JOIN members fm ON fm.id=s.member_id AND fm.family_id=s.family_id
      WHERE s.family_id=? AND s.active=1 AND (s.member_id IS NULL OR COALESCE(fm.active,0)=1)
      ORDER BY CASE WHEN s.member_id IS NOT NULL THEN 0 ELSE 1 END,COALESCE(fm.id,s.id),s.id LIMIT 100`).bind(familyId).all<Row>(),
    ctx.env.DB.prepare(`SELECT l.id,l.subject_id,l.log_type,l.occurred_at,l.detail_code,l.amount,l.unit,l.duration_minutes,l.value_text,l.note,l.linked_task_id,l.linked_occurrence_id,s.name subject_name
      FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
      WHERE l.family_id=? AND l.deleted_at IS NULL AND NOT ${IMPORTED_FAMILY_DIARY_SQL}
        AND l.occurred_at>=? AND l.occurred_at<=?
        AND (COALESCE((SELECT show_adult_logs FROM family_log_settings WHERE family_id=?),1)=1
          OR NOT EXISTS (SELECT 1 FROM family_log_subjects a WHERE a.id=l.subject_id AND a.family_id=l.family_id AND a.subject_kind='ADULT'))
      ORDER BY l.occurred_at DESC,l.id DESC LIMIT 201`).bind(familyId,`${date} 00:00:00`,`${date} 23:59:59`,familyId).all<Row>(),
    ctx.env.DB.prepare("SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key='family_log_milk_amount_presets' LIMIT 1").bind(familyId).first<Row>(),
  ]);
  let presets=[160,240];
  try{
    const values=JSON.parse(String(settings?.setting_value||''));
    if(Array.isArray(values))presets=values.map(Number).filter(v=>Number.isInteger(v)&&v>0&&v<=2000).slice(0,6);
  }catch{/* defaults */}
  return json({ok:true,schemaVersion:1,date,familyId,memberId:Number(member.id),
    subjects:subjects.results,logs:logs.results.slice(0,200),truncated:logs.results.length>200,milkPresets:presets},200,headers);
}
