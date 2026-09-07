import { addWallClockMinutes, utcNow } from './timezone';

export const DEFAULT_ROUGH_INPUT_AI_REQUESTS_PER_FAMILY_DAY=20;
export const DEFAULT_ROUGH_INPUT_AI_REQUESTS_GLOBAL_DAY=200;
export const MAX_ROUGH_INPUT_AI_REQUESTS_PER_FAMILY_DAY=100;
export const MAX_ROUGH_INPUT_AI_REQUESTS_GLOBAL_DAY=1000;
export const ROUGH_INPUT_AI_429_BACKOFF_MINUTES=15;

type Row=Record<string,unknown>;

const changed=(result:{meta:any})=>Number(result?.meta?.changes||0)>0;
const globalBudgetKey=(now:string)=>`utc-v1:${now.slice(0,10)}`;
const boundedPositiveInt=(value:unknown,fallback:number,max:number)=>{
  const parsed=Number(String(value??'').trim());
  return Number.isInteger(parsed)&&parsed>0?Math.min(parsed,max):fallback;
};

export function taskRoughInputAiLimits(env:Env){
  return {
    family:boundedPositiveInt((env as any).ROUGH_INPUT_AI_MAX_FAMILY_REQUESTS_PER_DAY,DEFAULT_ROUGH_INPUT_AI_REQUESTS_PER_FAMILY_DAY,MAX_ROUGH_INPUT_AI_REQUESTS_PER_FAMILY_DAY),
    global:boundedPositiveInt((env as any).ROUGH_INPUT_AI_MAX_GLOBAL_REQUESTS_PER_DAY,DEFAULT_ROUGH_INPUT_AI_REQUESTS_GLOBAL_DAY,MAX_ROUGH_INPUT_AI_REQUESTS_GLOBAL_DAY),
  };
}

export async function reserveTaskRoughInputAiRequest(db:D1Database,familyId:number,localDate:string,env:Env):Promise<boolean>{
  const now=utcNow(),budgetDate=globalBudgetKey(now),limits=taskRoughInputAiLimits(env);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO task_rough_input_ai_family_daily(family_id,local_date,request_count,created_at,updated_at) VALUES(?,?,0,?,?)').bind(familyId,localDate,now,now),
    db.prepare('INSERT OR IGNORE INTO task_rough_input_ai_global_daily(budget_date,request_count,blocked_until,created_at,updated_at) VALUES(?,0,NULL,?,?)').bind(budgetDate,now,now),
  ]);
  const globalReservation=await db.prepare("UPDATE task_rough_input_ai_global_daily SET request_count=request_count+1,updated_at=? WHERE budget_date=? AND request_count<? AND COALESCE(blocked_until,'')<=?").bind(now,budgetDate,limits.global,now).run();
  if(!changed(globalReservation))return false;
  const familyReservation=await db.prepare('UPDATE task_rough_input_ai_family_daily SET request_count=request_count+1,updated_at=? WHERE family_id=? AND local_date=? AND request_count<? RETURNING request_count').bind(now,familyId,localDate,limits.family).first<Row>();
  const slot=Number(familyReservation?.request_count||0);
  if(Number.isInteger(slot)&&slot>=1&&slot<=limits.family)return true;
  await db.prepare('UPDATE task_rough_input_ai_global_daily SET request_count=request_count-1,updated_at=? WHERE budget_date=? AND request_count>0').bind(now,budgetDate).run();
  return false;
}

export async function blockTaskRoughInputAiAfter429(db:D1Database):Promise<void>{
  const now=utcNow(),budgetDate=globalBudgetKey(now),blockedUntil=addWallClockMinutes(now,ROUGH_INPUT_AI_429_BACKOFF_MINUTES);
  await db.prepare("INSERT INTO task_rough_input_ai_global_daily(budget_date,request_count,blocked_until,created_at,updated_at) VALUES(?,0,?,?,?) ON CONFLICT(budget_date) DO UPDATE SET blocked_until=CASE WHEN COALESCE(blocked_until,'')>excluded.blocked_until THEN blocked_until ELSE excluded.blocked_until END,updated_at=excluded.updated_at").bind(budgetDate,blockedUntil,now,now).run();
}
