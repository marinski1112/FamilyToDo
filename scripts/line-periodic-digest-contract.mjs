import fs from 'node:fs';

const source=fs.readFileSync('src/line-periodic-digest.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const migration=fs.readFileSync('migrations/0063_line_periodic_digest_receipts.sql','utf8');

for(const marker of [
  "type DigestKind='WEEKLY'|'MONTHLY'",
  'WEEKLY_SEND_MINUTE=20*60',
  'MONTHLY_SEND_MINUTE=20*60+30',
  'weekday(localDate)===0',
  'monthEnd(localDate)',
  "WHERE s.enabled=1",
  'line_daily_digest_recipients',
  'line_daily_digest_subject_settings',
  'line_periodic_digest_receipts',
  "String(receipt.status)==='SENT'",
  'Number(receipt.attempt_count)>=3',
  'periodicDigestRetryKey(',
  'bytes[6]=(bytes[6]&0x0f)|0x80',
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  '【できたこと】',
  '【記録ハイライト】',
  'function praiseLines(',
  'MAX_PERIODIC_DIGEST_CHARS=1000',
])if(!source.includes(marker))throw new Error(`periodic digest marker missing: ${marker}`);

for(const marker of [
  "import { processLinePeriodicDigests } from './line-periodic-digest';",
  'ctx.waitUntil(processLinePeriodicDigests(env));',
])if(!index.includes(marker))throw new Error(`periodic digest scheduled wiring missing: ${marker}`);

for(const marker of [
  'CREATE TABLE IF NOT EXISTS line_periodic_digest_receipts',
  "CHECK(digest_kind IN ('WEEKLY','MONTHLY'))",
  'UNIQUE(family_id,member_id,digest_kind,period_key)',
  "CHECK(status IN ('PENDING','SENT','ERROR'))",
])if(!migration.includes(marker))throw new Error(`periodic digest receipt guard missing: ${marker}`);

if(/geminiFetch|generativelanguage|Maps|Routes|open-meteo|WEATHER_ENDPOINT|loadMorningWeatherFact/.test(source)){
  throw new Error('periodic rollups must remain deterministic and add no paid/external enrichment call');
}
if(/latitude|longitude|OwnTracks|device_secret|Authorization/.test(source)){
  throw new Error('periodic rollups must not access raw location/device data');
}
if((source.match(/pushLineMessage\(/g)||[]).length!==1)throw new Error('periodic digest must retain one LINE delivery call site');

console.log('line-periodic-digest-contract: Sunday/week-end and local month-end deterministic rollups; existing opt-in/recipients; retry-safe; no AI/weather/Maps/Routes/location enrichment');
