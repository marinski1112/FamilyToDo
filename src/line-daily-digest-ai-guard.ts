import { addWallClockMinutes, utcNow } from './timezone';

export const MAX_MORNING_AI_REQUESTS_PER_FAMILY_DAY=2;
export const MAX_MORNING_AI_REQUESTS_GLOBAL_DAY=120;
export const MORNING_AI_429_BACKOFF_MINUTES=15;

type Row=Record<string,unknown>;

const changed=(result:{meta:any})=>Number(result?.meta?.changes||0)>0;
const infrastructureDate=(now:string)=>now.slice(0,10);
const infrastructureBudgetKey=(now:string)=>`utc-v1:${infrastructureDate(now)}`;

export async function readFinalizedMorningDigestFrame(db:D1Database,familyId:number,localDate:string):Promise<string|null>{
  const row=await db.prepare('SELECT finalized,frame_json FROM line_daily_digest_ai_family_daily WHERE family_id=? AND local_date=?').bind(familyId,localDate).first<Row>();
  return Number(row?.finalized||0)===1&&typeof row?.frame_json==='string'&&row.frame_json?row.frame_json:null;
}

export async function reserveMorningDigestAiRequest(db:D1Database,familyId:number,localDate:string,ignoreCircuit=false,maxFamilyRequests=MAX_MORNING_AI_REQUESTS_PER_FAMILY_DAY):Promise<boolean>{
  const now=utcNow(),globalDate=infrastructureBudgetKey(now),familyLimit=Math.max(1,Math.min(MAX_MORNING_AI_REQUESTS_PER_FAMILY_DAY,Math.floor(maxFamilyRequests)));
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO line_daily_digest_ai_family_daily(family_id,local_date,request_count,finalized,frame_json,created_at,updated_at) VALUES(?,?,0,0,NULL,?,?)').bind(familyId,localDate,now,now),
    db.prepare('INSERT OR IGNORE INTO line_daily_digest_ai_global_daily(local_date,request_count,blocked_until,created_at,updated_at) VALUES(?,0,NULL,?,?)').bind(globalDate,now,now),
  ]);
  const globalReservation=await db.prepare("UPDATE line_daily_digest_ai_global_daily SET request_count=request_count+1,updated_at=? WHERE local_date=? AND request_count<? AND (?=1 OR COALESCE(blocked_until,'')<=?)").bind(now,globalDate,MAX_MORNING_AI_REQUESTS_GLOBAL_DAY,ignoreCircuit?1:0,now).run();
  if(!changed(globalReservation))return false;
  const familyReservation=await db.prepare('UPDATE line_daily_digest_ai_family_daily SET request_count=request_count+1,updated_at=? WHERE family_id=? AND local_date=? AND finalized=0 AND request_count<? RETURNING request_count').bind(now,familyId,localDate,familyLimit).first<Row>();
  const slot=Number(familyReservation?.request_count||0);
  if(Number.isInteger(slot)&&slot>=1&&slot<=familyLimit)return true;
  await db.prepare('UPDATE line_daily_digest_ai_global_daily SET request_count=request_count-1,updated_at=? WHERE local_date=? AND request_count>0').bind(now,globalDate).run();
  return false;
}

export async function finalizeMorningDigestFrame(db:D1Database,familyId:number,localDate:string,frameJson:string):Promise<void>{
  const now=utcNow();
  await db.prepare('INSERT INTO line_daily_digest_ai_family_daily(family_id,local_date,request_count,finalized,frame_json,created_at,updated_at) VALUES(?,?,0,1,?,?,?) ON CONFLICT(family_id,local_date) DO UPDATE SET finalized=1,frame_json=excluded.frame_json,updated_at=excluded.updated_at WHERE line_daily_digest_ai_family_daily.finalized=0').bind(familyId,localDate,frameJson,now,now).run();
}

export async function blockMorningDigestAiAfter429(db:D1Database,_localDate:string):Promise<void>{
  const now=utcNow(),globalDate=infrastructureBudgetKey(now),blockedUntil=addWallClockMinutes(now,MORNING_AI_429_BACKOFF_MINUTES);
  await db.prepare('INSERT INTO line_daily_digest_ai_global_daily(local_date,request_count,blocked_until,created_at,updated_at) VALUES(?,0,?,?,?) ON CONFLICT(local_date) DO UPDATE SET blocked_until=CASE WHEN COALESCE(blocked_until,\'\')>excluded.blocked_until THEN blocked_until ELSE excluded.blocked_until END,updated_at=excluded.updated_at').bind(globalDate,blockedUntil,now,now).run();
}
