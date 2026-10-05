import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {reserveAiCall,blockAiQuota} from '../src/ai-call-budget.ts';
import {geminiFetch} from '../src/family-ai.ts';
import {generateFamilyDailyJournalAi} from '../src/family-daily-journal-ai.ts';
function database(){
 const sql=new DatabaseSync(':memory:');
 for(const file of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('migrations/'+file,'utf8'));
 const wrap=(query,args=[])=>({bind(...v){return wrap(query,v);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}});
 return {sql,DB:{prepare:wrap,async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
}
const scope={familyId:1,feature:'FAMILY_DAILY_JOURNAL',trigger:'cron'};
test('family journal budget is bounded across selected models; another family has its own budget',async()=>{
 const {DB}=database(),env={DB,AI_JOURNAL_DAILY_BUDGET:'2'};
 assert(await reserveAiCall(env,scope,'gemini-test'));
 assert(await reserveAiCall(env,scope,'gemini-other'));
 assert.equal(await reserveAiCall(env,scope,'gemini-third'),false);
 assert(await reserveAiCall(env,{...scope,familyId:2},'gemini-test'));
});
test('429 blocks other models and prevents transport calls; ledger stores counts only',async()=>{
 const {DB,sql}=database(),env={DB,GEMINI_API_KEY:'synthetic-key'};let calls=0;const old=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return new Response('{}',{status:429});};
 try{assert.equal((await geminiFetch(env,'gemini-test',{private_text:'never persist'},scope)).status,429);assert.equal((await geminiFetch(env,'gemini-other',{},scope)).status,429);assert.equal(calls,1);
 const rows=sql.prepare('SELECT * FROM ai_call_daily').all();assert.equal(rows.reduce((n,r)=>n+r.calls,0),1);assert.equal(rows.reduce((n,r)=>n+r.rate_limit,0),1);assert(!JSON.stringify(rows).includes('never persist'));}finally{globalThis.fetch=old;}
});
test('budget storage failure fails closed without calling Gemini',async()=>{
 let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;return new Response('{}');};
 try{await assert.rejects(geminiFetch({DB:{prepare(){throw new Error('unavailable');}},GEMINI_API_KEY:'test'},'gemini-test',{},scope));assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
test('concurrent cron consumes a content version once; unchanged evidence makes no new call',async()=>{
 const {DB,sql}=database();sql.exec("INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'test','test','x','x'); INSERT INTO family_daily_journals(family_id,journal_date,summary_text,generated_at,updated_at) VALUES(1,'2026-01-01','自宅で過ごしました。','x','x');");
 let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;return Response.json({candidates:[{content:{parts:[{text:'自宅で過ごしました。'}]}}]});};
 try{const env={DB,GEMINI_API_KEY:'synthetic'};await Promise.all([generateFamilyDailyJournalAi(env),generateFamilyDailyJournalAi(env)]);await generateFamilyDailyJournalAi(env);assert.equal(calls,1);assert.equal(sql.prepare('SELECT ai_status FROM family_daily_journals').get().ai_status,'AI_OK');}finally{globalThis.fetch=old;}
});
test('video recipe extraction gets a bounded 30 second wait while existing features retain 10 seconds',async()=>{
 const {DB}=database(),env={DB,GEMINI_API_KEY:'synthetic'},realFetch=globalThis.fetch,realTimer=globalThis.setTimeout,delays=[];
 globalThis.fetch=async()=>new Response('{}',{headers:{'content-type':'application/json'}});globalThis.setTimeout=(fn,ms,...args)=>{delays.push(ms);return realTimer(fn,ms,...args);};
 try{await geminiFetch(env,'gemini-test',{}, {familyId:1,feature:'FAMILY_AI',trigger:'user'});await geminiFetch(env,'gemini-test',{}, {familyId:1,feature:'MEAL_RECIPE_EXTRACT',trigger:'user'});assert.deepEqual(delays,[10000,30000]);}finally{globalThis.fetch=realFetch;globalThis.setTimeout=realTimer;}
});
