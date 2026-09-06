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

const sharedFacts=source.indexOf('const facts=await loadPeriodFacts('),narrative=source.indexOf('narrative=await chooseNarrative(',sharedFacts),recipientGrouping=source.indexOf('const destinations=new Map<string,Row[]>()',sharedFacts);
if(sharedFacts<0||narrative<sharedFacts||recipientGrouping<narrative)throw new Error('periodic facts/narrative must be generated once per family/report before recipient destination fan-out');

const renderStart=source.indexOf('function renderReport('),renderEnd=source.indexOf('\nasync function retryKey(',renderStart),renderBody=renderStart>=0&&renderEnd>renderStart?source.slice(renderStart,renderEnd):'';
for(const marker of ["let base=[...required.slice(0,2),...extras,...required.slice(2)].join('\\n')","if(base.length>MAX_LINE_CHARS){base=required.join('\\n').slice(0,MAX_LINE_CHARS);}",'const available=MAX_LINE_CHARS-base.length-1','slice(0,MAX_LINE_CHARS)'])if(!renderBody.includes(marker))throw new Error(`periodic bounded rendering marker missing: ${marker}`);

console.log('line-periodic-digest-contract: weekly/month-end boundaries, recurrence-aware totals, pending/completed samples, destination dedupe, recovery, idempotency, FAMILY-only evidence, bounded rendering, bounded shared AI and no external fan-out ok');
