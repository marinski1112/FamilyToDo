export type AiCallScope={familyId:number;feature:string;trigger:'user'|'event'|'cron'|'diagnostic';attempt?:number;videoDurationSeconds?:number};
const day=(now:string)=>now.slice(0,10);
const limit=(value:unknown,fallback:number)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<=100000?n:fallback;};
export async function recordAiCall(db:D1Database,scope:AiCallScope,model:string,outcome:'calls'|'success'|'rate_limit'|'upstream_error'|'skipped_budget'|'skipped_dedupe',now=new Date().toISOString()):Promise<void>{
 if(!/^[A-Z_]{1,50}$/.test(scope.feature)||!Number.isSafeInteger(scope.familyId)||scope.familyId<0)throw new Error('Invalid AI scope');
 const fallback=outcome==='calls'&&Number(scope.attempt||0)>0?1:0;
 await db.prepare(`INSERT INTO ai_call_daily(family_id,feature,model,trigger_kind,day,${outcome},fallback) VALUES(?,?,?,?,?,1,?) ON CONFLICT(family_id,feature,model,trigger_kind,day) DO UPDATE SET ${outcome}=${outcome}+1,fallback=fallback+excluded.fallback`)
 .bind(scope.familyId,scope.feature,model,scope.trigger,day(now),fallback).run();
}
export async function reserveAiCall(env:Env,scope:AiCallScope,model:string,now=new Date().toISOString()):Promise<boolean>{
 const db=env.DB,d=day(now),global=`project:${model}`,local=`family:${scope.familyId}:${scope.feature}`;
 const projectLimit=limit(env.AI_MODEL_DAILY_BUDGET,100);
 const featureLimit=scope.feature==='FAMILY_DAILY_JOURNAL'?limit(env.AI_JOURNAL_DAILY_BUDGET,2):limit(env.AI_FEATURE_DAILY_BUDGET,20);
 await db.batch([global,local,'project:quota'].map(s=>db.prepare('INSERT OR IGNORE INTO ai_call_budgets(scope,day,updated_at) VALUES(?,?,?)').bind(s,d,now)));
 const slot=await db.prepare("UPDATE ai_call_budgets SET calls=calls+1,updated_at=? WHERE scope=? AND day=? AND calls<? AND COALESCE(blocked_until,'')<=? AND NOT EXISTS(SELECT 1 FROM ai_call_budgets WHERE scope='project:quota' AND day=? AND COALESCE(blocked_until,'')>?) RETURNING calls")
 .bind(now,global,d,projectLimit,now,d,now).first();
 if(!slot){await recordAiCall(db,scope,model,'skipped_budget',now);return false;}
 const family=await db.prepare('UPDATE ai_call_budgets SET calls=calls+1,updated_at=? WHERE scope=? AND day=? AND calls<? RETURNING calls').bind(now,local,d,featureLimit).first();
 if(!family){await db.prepare('UPDATE ai_call_budgets SET calls=calls-1 WHERE scope=? AND day=? AND calls>0').bind(global,d).run();await recordAiCall(db,scope,model,'skipped_budget',now);return false;}
 await recordAiCall(db,scope,model,'calls',now);return true;
}
export async function blockAiQuota(db:D1Database,now=new Date().toISOString()):Promise<void>{
 const until=new Date(Date.parse(now)+15*60_000).toISOString();
 await db.prepare("INSERT INTO ai_call_budgets(scope,day,blocked_until,updated_at) VALUES('project:quota',?,?,?) ON CONFLICT(scope,day) DO UPDATE SET blocked_until=MAX(COALESCE(blocked_until,''),excluded.blocked_until),updated_at=excluded.updated_at").bind(day(now),until,now).run();
}
export async function cleanupAiCallCounts(db:D1Database):Promise<void>{
 const cutoff=new Date(Date.now()-30*86400_000).toISOString().slice(0,10);
 await db.batch([db.prepare('DELETE FROM ai_call_daily WHERE day<?').bind(cutoff),db.prepare('DELETE FROM ai_call_budgets WHERE day<?').bind(cutoff)]);
}

/** Dedicated duration units, separate from call counters. Failed long jobs keep their reservation. */
export async function reserveMealVideoDuration(db:D1Database,familyId:number,seconds:number,now=new Date().toISOString()):Promise<boolean>{
 if(!Number.isSafeInteger(familyId)||familyId<1||!Number.isSafeInteger(seconds)||seconds<601||seconds>1800)throw new Error('Invalid video duration');
 const d=day(now),global='project:meal-long-video-seconds',local=`family:${familyId}:meal-long-video-seconds`;
 await db.batch([global,local].map(s=>db.prepare('INSERT OR IGNORE INTO ai_call_budgets(scope,day,updated_at) VALUES(?,?,?)').bind(s,d,now)));
 const slot=await db.prepare('UPDATE ai_call_budgets SET calls=calls+?,updated_at=? WHERE scope=? AND day=? AND calls<=? RETURNING calls').bind(seconds,now,global,d,14400-seconds).first();
 if(!slot)return false;
 const family=await db.prepare('UPDATE ai_call_budgets SET calls=calls+?,updated_at=? WHERE scope=? AND day=? AND calls<=? RETURNING calls').bind(seconds,now,local,d,3600-seconds).first();
 if(!family){await db.prepare('UPDATE ai_call_budgets SET calls=calls-? WHERE scope=? AND day=? AND calls>=?').bind(seconds,global,d,seconds).run();return false;}
 return true;
}
