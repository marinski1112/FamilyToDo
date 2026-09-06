import { addWallClockMinutes, utcNow } from './timezone';

export const MAX_PERIODIC_AI_REQUESTS_PER_REPORT=2;
export const MAX_PERIODIC_AI_REQUESTS_GLOBAL_DAY=120;
export const PERIODIC_AI_429_BACKOFF_MINUTES=15;

type Row=Record<string,unknown>;
type ReportType='WEEKLY'|'MONTHLY';
const changed=(result:{meta:any})=>Number(result?.meta?.changes||0)>0;
const globalKey=(now:string)=>`utc-v1:${now.slice(0,10)}`;

export async function readFinalizedPeriodicDigestFrame(db:D1Database,familyId:number,reportType:ReportType,periodKey:string):Promise<string|null>{
  const row=await db.prepare('SELECT finalized,frame_json FROM line_periodic_digest_ai_reports WHERE family_id=? AND report_type=? AND period_key=?').bind(familyId,reportType,periodKey).first<Row>();
  return Number(row?.finalized||0)===1&&typeof row?.frame_json==='string'&&row.frame_json?row.frame_json:null;
}

export async function reservePeriodicDigestAiRequest(db:D1Database,familyId:number,reportType:ReportType,periodKey:string,ignoreCircuit=false):Promise<boolean>{
  const now=utcNow(),dayKey=globalKey(now);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO line_periodic_digest_ai_reports(family_id,report_type,period_key,request_count,finalized,frame_json,created_at,updated_at) VALUES(?,?,?,0,0,NULL,?,?)').bind(familyId,reportType,periodKey,now,now),
    db.prepare('INSERT OR IGNORE INTO line_daily_digest_ai_global_daily(local_date,request_count,blocked_until,created_at,updated_at) VALUES(?,0,NULL,?,?)').bind(dayKey,now,now),
  ]);
  const globalReservation=await db.prepare("UPDATE line_daily_digest_ai_global_daily SET request_count=request_count+1,updated_at=? WHERE local_date=? AND request_count<? AND (?=1 OR COALESCE(blocked_until,'')<=?)").bind(now,dayKey,MAX_PERIODIC_AI_REQUESTS_GLOBAL_DAY,ignoreCircuit?1:0,now).run();
  if(!changed(globalReservation))return false;
  const reportReservation=await db.prepare('UPDATE line_periodic_digest_ai_reports SET request_count=request_count+1,updated_at=? WHERE family_id=? AND report_type=? AND period_key=? AND finalized=0 AND request_count<? RETURNING request_count').bind(now,familyId,reportType,periodKey,MAX_PERIODIC_AI_REQUESTS_PER_REPORT).first<Row>();
  const slot=Number(reportReservation?.request_count||0);
  if(Number.isInteger(slot)&&slot>=1&&slot<=MAX_PERIODIC_AI_REQUESTS_PER_REPORT)return true;
  await db.prepare('UPDATE line_daily_digest_ai_global_daily SET request_count=request_count-1,updated_at=? WHERE local_date=? AND request_count>0').bind(now,dayKey).run();
  return false;
}

export async function finalizePeriodicDigestFrame(db:D1Database,familyId:number,reportType:ReportType,periodKey:string,frameJson:string):Promise<void>{
  const now=utcNow();
  await db.prepare('INSERT INTO line_periodic_digest_ai_reports(family_id,report_type,period_key,request_count,finalized,frame_json,created_at,updated_at) VALUES(?,?,?,0,1,?,?,?) ON CONFLICT(family_id,report_type,period_key) DO UPDATE SET finalized=1,frame_json=excluded.frame_json,updated_at=excluded.updated_at WHERE line_periodic_digest_ai_reports.finalized=0').bind(familyId,reportType,periodKey,frameJson,now,now).run();
}

export async function blockPeriodicDigestAiAfter429(db:D1Database):Promise<void>{
  const now=utcNow(),dayKey=globalKey(now),blockedUntil=addWallClockMinutes(now,PERIODIC_AI_429_BACKOFF_MINUTES);
  await db.prepare("INSERT INTO line_daily_digest_ai_global_daily(local_date,request_count,blocked_until,created_at,updated_at) VALUES(?,0,?,?,?) ON CONFLICT(local_date) DO UPDATE SET blocked_until=CASE WHEN COALESCE(blocked_until,'')>excluded.blocked_until THEN blocked_until ELSE excluded.blocked_until END,updated_at=excluded.updated_at").bind(dayKey,blockedUntil,now,now).run();
}
