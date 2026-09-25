import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const index=read('src/index.ts'),digest=read('src/line-daily-digest.ts'),guard=read('src/line-daily-digest-ai-guard.ts');
const weather=read('src/line-daily-digest-weather.ts'),migration=read('migrations/0061_line_daily_digest_ai_cost_guard.sql');
assert.ok(index.includes("import { processLineDailyDigests } from './line-daily-digest';")&&index.includes('ctx.waitUntil(processLineDailyDigests(env));'));
for(const marker of [
  'line_daily_digest_settings','line_daily_digest_recipients','line_daily_digest_receipts',
  "t.visibility_scope='PRIVATE' AND t.private_owner_id=?",'goodsVisibilitySql',
  'receipts.filter(receipt=>Number(receipt.attempt_count)<3)',
  'renderMorningMessage(env,Number(setting.family_id),localDate,lineUserId,facts,weatherFact)',
  'reserveMorningDigestAiRequest(env.DB,familyId,key,false,1)',
  'await readFinalizedMorningDigestFrame(env.DB,familyId,key)',
  'remaining_tasks','remaining_shopping','today_bring_items','today_events','home_weather',
  'loadMorningWeatherFact(env.DB,Number(setting.family_id),localDate,timezone)',
])assert.ok(digest.includes(marker),`active morning contract missing: ${marker}`);
for(const obsolete of ['FRAME_OPTIONS','deterministicPersonalNote','memberMorning','renderDeterministicFacts','buildLocationDigestDayFacts','familyLog','dailyFortune','morningNarrativeEvidence'])assert.ok(!digest.includes(obsolete),`obsolete morning feature remains: ${obsolete}`);
assert.equal((digest.match(/await geminiFetch\(/g)||[]).length,1,'one Gemini call site, with no model retry');
assert.equal((digest.match(/pushLineMessage\(/g)||[]).length,1,'one push per LINE destination');
assert.ok(digest.indexOf('const pending=receipts.filter(')<digest.indexOf('await renderMorningMessage('),'receipt gate must precede AI');
assert.ok(digest.indexOf('reserveMorningDigestAiRequest(env.DB,familyId,key,false,1)')<digest.indexOf('await geminiFetch(env,model,'));
assert.ok(digest.includes('JSON.stringify({narrativeVersion:4,message:null,generation})'),'PRIVATE narrative must not be cached family-wide');
for(const marker of ['MAX_MORNING_AI_REQUESTS_GLOBAL_DAY=120','blocked_until','finalized=0 AND request_count<?'])assert.ok(guard.includes(marker));
assert.ok(migration.includes('PRIMARY KEY(family_id, local_date)'));
assert.ok(weather.includes("const WEATHER_ENDPOINT='https://api.open-meteo.com/v1/forecast'"));
console.log('LINE morning: five facts, destination privacy, one Gemini call, retry receipts and global budget verified');
