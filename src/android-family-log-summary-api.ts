import type {AppContext} from './app-context';
import {IMPORTED_FAMILY_DIARY_SQL} from './imported-family-diary';
import {json} from './response';

type Row=Record<string,unknown>;
const headers={'cache-control':'private, no-store'};
const parseDay=(value:string):number|null=>{
  if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return null;
  const ms=Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?ms:null;
};

/** On-demand daily aggregation; bounded to one month and the caller's visible family logs. */
export async function androidFamilyLogSummaryApi(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
  const member=ctx.member;
  if(!member)return json({ok:false,code:'AUTH_REQUIRED'},401,headers);
  const url=new URL(request.url),from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
  const fromMs=parseDay(from),toMs=parseDay(to),subjectRaw=url.searchParams.get('subject')||'';
  if(fromMs===null||toMs===null||fromMs>toMs||toMs-fromMs>29*86400000||
    (subjectRaw!==''&&!/^[1-9]\d*$/.test(subjectRaw)))return json({ok:false,code:'INVALID_RANGE'},400,headers);
  const familyId=Number(member.family_id),subjectId=subjectRaw?Number(subjectRaw):0;
  if(subjectId&&!Number.isSafeInteger(subjectId))return json({ok:false,code:'INVALID_SUBJECT'},400,headers);
  if(subjectId){
    const subject=await ctx.env.DB.prepare(`SELECT s.id FROM family_log_subjects s
      LEFT JOIN members fm ON fm.id=s.member_id AND fm.family_id=s.family_id
      WHERE s.id=? AND s.family_id=? AND s.active=1
        AND (s.member_id IS NULL OR COALESCE(fm.active,0)=1) LIMIT 1`).bind(subjectId,familyId).first<Row>();
    if(!subject)return json({ok:false,code:'INVALID_SUBJECT'},404,headers);
  }
  const rows=await ctx.env.DB.prepare(`SELECT substr(l.occurred_at,1,10) day,COUNT(*) entries,
      COALESCE(SUM(CASE WHEN l.log_type='MILK' AND lower(l.unit)='ml' THEN l.amount ELSE 0 END),0) milkMl,
      SUM(CASE WHEN l.log_type='DIAPER' AND l.detail_code IN ('WET','BOTH') THEN 1 ELSE 0 END) wet,
      SUM(CASE WHEN l.log_type='DIAPER' AND l.detail_code IN ('DIRTY','BOTH') THEN 1 ELSE 0 END) dirty,
      COALESCE(SUM(CASE WHEN l.log_type='SLEEP' THEN l.duration_minutes ELSE 0 END),0) sleepMinutes,
      SUM(CASE WHEN l.log_type='MEAL' THEN 1 ELSE 0 END) meals,
      SUM(CASE WHEN l.log_type='TOILET' THEN 1 ELSE 0 END) toilet,
      SUM(CASE WHEN l.log_type='BATH' THEN 1 ELSE 0 END) baths,
      SUM(CASE WHEN l.log_type='MEDICINE' THEN 1 ELSE 0 END) medicine,
      SUM(CASE WHEN l.log_type='HOUSEWORK' THEN 1 ELSE 0 END) chores,
      COALESCE(SUM(CASE WHEN l.log_type='WATER' AND lower(l.unit)='ml' THEN l.amount ELSE 0 END),0) waterMl,
      COALESCE(SUM(CASE WHEN l.log_type='EXERCISE' THEN l.duration_minutes ELSE 0 END),0) exerciseMinutes,
      COALESCE(SUM(CASE WHEN l.log_type='WALK' THEN l.duration_minutes ELSE 0 END),0) walkMinutes,
      MAX(CASE WHEN l.log_type='TEMPERATURE' THEN l.amount END) temperatureMax,
      MAX(CASE WHEN l.log_type='WEIGHT' THEN l.amount END) weightMax,
      MAX(CASE WHEN l.log_type='HEIGHT' THEN l.amount END) heightMax
    FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
    WHERE l.family_id=? AND l.deleted_at IS NULL AND NOT ${IMPORTED_FAMILY_DIARY_SQL}
      AND l.occurred_at>=? AND l.occurred_at<=? AND (?=0 OR l.subject_id=?)
      AND (COALESCE((SELECT show_adult_logs FROM family_log_settings WHERE family_id=?),1)=1
        OR COALESCE(s.subject_kind,'')<>'ADULT')
    GROUP BY substr(l.occurred_at,1,10) ORDER BY day DESC LIMIT 31`)
    .bind(familyId,`${from} 00:00:00`,`${to} 23:59:59`,subjectId,subjectId,familyId).all<Row>();
  const keys=['entries','milkMl','wet','dirty','sleepMinutes','meals','toilet','baths','medicine','chores','waterMl','exerciseMinutes','walkMinutes'] as const;
  const daily=rows.results.map(row=>{
    const result:Record<string,string|number|null>={day:String(row.day||'')};
    for(const key of keys)result[key]=Number(row[key]||0);
    for(const key of ['temperatureMax','weightMax','heightMax'])result[key]=row[key]==null?null:Number(row[key]);
    return result;
  });
  const totals:Record<string,number>={};
  for(const key of keys)totals[key]=daily.reduce((sum,row)=>sum+Number(row[key]||0),0);
  const measurements=await ctx.env.DB.prepare(`SELECT id,log_type,amount,unit,occurred_at FROM (
      SELECT l.id,l.log_type,l.amount,l.unit,l.occurred_at,
        ROW_NUMBER() OVER (PARTITION BY l.log_type ORDER BY l.occurred_at DESC,l.id DESC) rn
      FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
      WHERE l.family_id=? AND l.deleted_at IS NULL AND l.log_type IN ('TEMPERATURE','WEIGHT','HEIGHT') AND l.amount IS NOT NULL
        AND l.occurred_at>=? AND l.occurred_at<=? AND (?=0 OR l.subject_id=?)
        AND (COALESCE((SELECT show_adult_logs FROM family_log_settings WHERE family_id=?),1)=1
          OR COALESCE(s.subject_kind,'')<>'ADULT')) WHERE rn=1 LIMIT 3`)
    .bind(familyId,`${from} 00:00:00`,`${to} 23:59:59`,subjectId,subjectId,familyId).all<Row>();
  return json({ok:true,from,to,subjectId,daily,totals,latestMeasurements:measurements.results},200,headers);
}
