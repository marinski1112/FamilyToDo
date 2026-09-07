import fs from 'node:fs';

const source=fs.readFileSync('src/line-periodic-digest.ts','utf8');
const guard=fs.readFileSync('src/line-periodic-digest-ai-guard.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const migration=fs.readFileSync('migrations/0063_line_periodic_digest.sql','utf8');

for(const marker of [
  "type ReportType='WEEKLY'|'MONTHLY'",
  "weeklyPeriod(localDate)",
  "monthlyPeriod(localDate)",
  "weekday(localDate)===1&&now<360",
  "localDate.endsWith('-01')&&now<360",
  "COALESCE(t.visibility_scope,'FAMILY')='FAMILY'",
  'line_daily_digest_subject_settings',
  'loadSafeFamilyAiProfileContext',
  'PRIVATEタスク、raw GPS、座標、位置履歴は渡していないため推測しないでください',
  'if(/[0-9０-９〇零一二三四五六七八九十百千万億兆]/u.test(value))return false',
  'reservePeriodicDigestAiRequest',
  'line_periodic_digest_receipts',
  'recurrence_occurrences o',
  'COALESCE(et.status,o.status)',
  "NOT EXISTS (SELECT 1 FROM recurrence_rules rr WHERE rr.family_id=t.family_id AND rr.task_id=t.id)",
  "String(row.status).toLowerCase()==='completed'?'✓':'□'",
  'const destinations=new Map<string,Row[]>()',
  "receipts.some(receipt=>String(receipt.status)==='SENT')",
  'receipts.filter(receipt=>Number(receipt.attempt_count)<3)',
  'familytodo:periodic-digest:v2:',
  'MAX_LINE_CHARS=1000',
])if(!source.includes(marker))throw new Error(`periodic digest marker missing: ${marker}`);

if((source.match(/geminiFetch\(env,/g)||[]).length!==1)throw new Error('periodic digest must have exactly one bounded Gemini call site');
const rawLocationReads=[
  /buildLocationDigestDayFacts\s*\(/,
  /\b(?:FROM|JOIN)\s+(?:member_)?location_(?:history|devices?)\b/i,
  /\bowntracks\b.*\b(?:SELECT|FROM|JOIN|prepare)\b/i,
  /\b(?:latitude|longitude|public_device_id|device_id)\b\s*(?:,|FROM|JOIN|WHERE|=\?)/i,
];
if(rawLocationReads.some(pattern=>pattern.test(source)))throw new Error('periodic digest must not read Location/raw GPS sources');
if(/Open-Meteo|loadMorningWeatherFact|Routes|Maps|Search grounding/.test(source))throw new Error('periodic digest must not fan out to weather/maps/routes/search');

for(const marker of [
  'MAX_PERIODIC_AI_REQUESTS_PER_REPORT=2',
  'MAX_PERIODIC_AI_REQUESTS_GLOBAL_DAY=120',
  'PERIODIC_AI_429_BACKOFF_MINUTES=15',
  'line_periodic_digest_ai_reports',
  'line_daily_digest_ai_global_daily',
  'request_count=request_count+1',
  'request_count=request_count-1',
  'blocked_until',
])if(!guard.includes(marker))throw new Error(`periodic AI guard missing: ${marker}`);
if(/geminiFetch|fetch\(/.test(guard))throw new Error('periodic AI budget guard must not call external APIs');

for(const marker of [
  "import { processLinePeriodicDigests } from './line-periodic-digest';",
  'ctx.waitUntil(processLinePeriodicDigests(env));',
])if(!index.includes(marker))throw new Error(`periodic scheduler wiring missing: ${marker}`);

for(const marker of [
  "weekly_enabled INTEGER NOT NULL DEFAULT 1",
  "weekly_send_time TEXT NOT NULL DEFAULT '20:30'",
  "monthly_enabled INTEGER NOT NULL DEFAULT 1",
  "monthly_send_time TEXT NOT NULL DEFAULT '20:45'",
  'CREATE TABLE line_periodic_digest_receipts',
  "CHECK(report_type IN ('WEEKLY','MONTHLY'))",
  'UNIQUE(family_id,member_id,report_type,period_key)',
  'CREATE TABLE line_periodic_digest_ai_reports',
  'CHECK(request_count BETWEEN 0 AND 2)',
  'PRIMARY KEY(family_id,report_type,period_key)',
])if(!migration.includes(marker))throw new Error(`periodic migration marker missing: ${marker}`);

const pending=source.indexOf('const pending=receipts.filter'),sharedFacts=source.indexOf('const facts=await loadPeriodFacts(');
if(sharedFacts<pending||!source.includes('if(message===undefined)'))throw new Error('facts and shared narrative must be loaded lazily after pending receipts');
if(!source.includes("if(!String(env.LINE_ACCESS_TOKEN||'').trim())return"))throw new Error('missing token must not consume receipts');

// Execute the real renderer: overflowing optional details must never drop prose/totals/fortune.
const { createRequire }=await import('node:module');
const require=createRequire(import.meta.url);
let transpile;
try{const ts=require('typescript');transpile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}
catch{const {stripTypeScriptTypes}=await import('node:module');transpile=code=>stripTypeScriptTypes(code);}
const vm=await import('node:vm');
const renderStart=source.indexOf('function renderReport('),renderEnd=source.indexOf('\nasync function retryKey(',renderStart);
const fortuneSource=fs.readFileSync('src/daily-fortune.ts','utf8').replace(/export /g,'');
const code=transpile(fortuneSource+'\nconst MAX_LINE_CHARS=1000,MAX_NARRATIVE_CHARS=360; const clean=(v,max)=>String(v??"").replace(/[\\r\\n]+/g," ").trim().slice(0,max); const monthLabel=d=>Number(d.slice(5,7))+"月";\n'+source.slice(renderStart,renderEnd));
const context=vm.createContext({});vm.runInContext(code,context);
for(const reportType of ['WEEKLY','MONTHLY'])for(const size of [0,2,12]){
 const facts={period:{reportType,periodKey:reportType+':2026-09',endDate:'2026-09-30',label:'対象期間'},logLines:Array(size).fill('記録'.repeat(100)),samples:Array(size).fill('予定'.repeat(30)),eventCount:3,taskCompleted:5,taskIncomplete:7,itemCompleted:2,itemIncomplete:4};
 const prose='楽しい家族の振り返り。'.repeat(30);
 const message=context.renderReport(facts,prose,42);
 if(message.length>1000||!message.includes(prose.slice(0,360))||!message.includes('現在完了5・未完了7')||!message.includes('現在完了2・未完了4')||!message.includes('家族のお楽しみ占い')||!message.includes('カラー:'))throw new Error('report content lost under length pressure');
 if(message!==context.renderReport(facts,prose,42))throw new Error('retry must retain stable family fortune');
}

const daily=fs.readFileSync('src/line-daily-digest.ts','utf8');
const dailyRender=daily.slice(daily.indexOf('function fitMorningDigest('),daily.indexOf('\nexport async function processLineDailyDigests('));
vm.runInContext(transpile('const MAX_MORNING_DIGEST_CHARS=1000,MAX_MORNING_NARRATIVE_CHARS=320; const buildEvidencePraise=()=>[],buildDeterministicAdvice=()=>[];\n'+dailyRender),context);
const payload={localDate:'2026-09-07',previousDate:'2026-09-06',familyLog:{previous:Array(12).fill('記録'.repeat(100)),today:[]},today:{events:[],tasks:[],bringItems:[],completed:3,incomplete:4,overdue:2},location:{previous:[],today:[]},fortune:context.dailyFortune(42,0,'2026-09-07')};
const dailyMessage=context.renderDeterministicFacts(payload,{opener:'おはよう',closing:'またね',personalNote:'家族の自由な文章。'.repeat(30)},null);
if(dailyMessage.length>1000||!dailyMessage.includes('家族の自由な文章。'.repeat(30))||!dailyMessage.includes('完了3・未完了4／期限切れ2件')||!dailyMessage.includes('お楽しみ占い')||!dailyMessage.endsWith('またね'))throw new Error('busy morning must retain recap, totals and fortune');
if(!daily.includes("if(!String(env.LINE_ACCESS_TOKEN||'').trim())return"))throw new Error('daily missing token must not consume receipts');
console.log('line-periodic-digest-contract: scheduling, privacy, dedupe, lazy shared generation, missing-token guards and daily/periodic overflow behavior ok');
