import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');
const settings=fs.readFileSync('src/settings-api.ts','utf8');
const browser=fs.readFileSync('public/assets/settings-notifications.js','utf8');
const migration=fs.readFileSync('migrations/0055_line_daily_digest_family_summary.sql','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const locationSummary=fs.readFileSync('src/location-day-summary.ts','utf8');
const aiGuard=fs.readFileSync('src/line-daily-digest-ai-guard.ts','utf8');
const aiGuardMigration=fs.readFileSync('migrations/0061_line_daily_digest_ai_cost_guard.sql','utf8');

for(const sentinel of [
  "import { processLineDailyDigests } from './line-daily-digest';",
  'processLineDailyDigests(this.env)',
])if(!index.includes(sentinel))throw new Error(`daily digest scheduling missing: ${sentinel}`);

for(const sentinel of [
  'line_daily_digest_settings',
  'line_daily_digest_recipients',
  'line_daily_digest_receipts',
  'morningDigestRetryKey',
  "x-line-retry-key",
  'buildFactPayload',
  'renderDeterministicFacts',
  'buildDeterministicAdvice',
  'buildEvidencePraise',
  'buildPreviousFamilyRecap',
  'MAX_MORNING_DIGEST_CHARS=1000',
  'dailyFortune(familyId,memberId,localDate)',
  '【お楽しみ占い】',
  'loadMorningWeatherFact',
])if(!digest.includes(sentinel))throw new Error(`daily digest boundary missing: ${sentinel}`);

if(!digest.includes("WHERE s.enabled=1"))throw new Error('digest must remain explicitly enabled per family');
if(!digest.includes("r.enabled=1"))throw new Error('digest recipient must remain explicitly enabled');
if(!digest.includes("m.active=1 AND m.deleted_at IS NULL"))throw new Error('digest recipients must remain active/not deleted');
if(!digest.includes("String(receipt.status)==='SENT'"))throw new Error('digest delivery must retain SENT idempotency gate');
if(!digest.includes('Number(receipt.attempt_count)>=3'))throw new Error('digest retries must remain bounded');
if(!digest.includes('morningDigestRetryKey(Number(setting.family_id),Number(member.id),localDate)'))throw new Error('LINE retry key must stay stable per family/member/day');

const processStart=digest.indexOf('export async function processLineDailyDigests(');
const processBody=processStart>=0?digest.slice(processStart):'';
const receiptGate=processBody.indexOf("String(receipt.status)==='SENT'");
const locationRead=processBody.indexOf('buildLocationDigestDayFacts({');
const frameInvocation=processBody.indexOf('chooseFrame(env,toneLevel(setting.tone_level),Number(setting.family_id),localDate)');
const chooseFrameStart=digest.indexOf('async function chooseFrame(');
const chooseFrameEnd=digest.indexOf('\nfunction logFact(',chooseFrameStart);
const chooseFrameBody=chooseFrameStart>=0&&chooseFrameEnd>chooseFrameStart?digest.slice(chooseFrameStart,chooseFrameEnd):'';
const aiEligibilityGuard=chooseFrameBody.indexOf("familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env)");
const persistedGuardRead=chooseFrameBody.indexOf('await readFinalizedMorningDigestFrame(env.DB,familyId,localDate)');
const profileLoader=chooseFrameBody.indexOf('await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)');
const reservation=chooseFrameBody.indexOf('reserveMorningDigestAiRequest(env.DB,familyId,localDate,attempt>0)');
const liveGemini=chooseFrameBody.indexOf('await geminiFetch(env,model,body)');
if(receiptGate<0||locationRead<0||locationRead<receiptGate){
  throw new Error('optional Location history must be deferred until after receipt SENT/retry gating');
}
if(receiptGate<0||frameInvocation<0||frameInvocation<receiptGate||persistedGuardRead<0||profileLoader<0||aiEligibilityGuard<0){
  throw new Error('morning frame must retain persisted daily guard, consent-filtered profile projection, and explicit Gemini eligibility');
}
if(reservation<0||liveGemini<0||reservation>liveGemini||reservation<persistedGuardRead||reservation<profileLoader||reservation<aiEligibilityGuard)throw new Error('every morning Gemini live call must follow persisted/profile/eligibility checks and reserve bounded daily budget first');
const authoritativeMarkers=['【今日の記録】','【今日の予定】','【今日のタスク】','【今日のヒント】'];
const firstLocation=Math.min(...['【昨日の移動】','【今日の移動】'].map(marker=>digest.indexOf(marker)).filter(index=>index>=0));
if(firstLocation<0||authoritativeMarkers.some(marker=>digest.indexOf(marker)<0||digest.indexOf(marker)>firstLocation)){
  throw new Error('authoritative Family Log/schedule/task/advice sections must render before optional Location enrichment');
}
const adviceStart=digest.indexOf('function buildDeterministicAdvice('),adviceEnd=digest.indexOf('\nfunction buildPreviousFamilyRecap(',adviceStart);
const adviceBody=adviceStart>=0&&adviceEnd>adviceStart?digest.slice(adviceStart,adviceEnd):'';
if(!adviceBody||/familyLog|\.location|MILK|BREASTFEED|DIAPER|TEMPERATURE|WEIGHT|HEIGHT|MEDICINE/i.test(adviceBody)){
  throw new Error('morning advice must remain bounded to task/schedule planning facts, not health/body/location inference');
}
for(const sentinel of ['digest_tone','digest_subjects','FRIENDLY_LIGHT']){
  if(!settings.includes(sentinel)||!browser.includes(sentinel)) throw new Error(`digest settings control missing: ${sentinel}`);
}
if(!settings.includes('line_daily_digest_subject_settings'))throw new Error('digest settings must persist subject inclusion server-side');
if(!migration.includes("DEFAULT 'FRIENDLY_LIGHT'"))throw new Error('digest tone must default to friendly/light humor');
if(!migration.includes('enabled INTEGER NOT NULL DEFAULT 1'))throw new Error('digest subject inclusion must default ON');
if(/latitude|longitude|location_history|owntracks|device_id|public_device_id|secret/i.test(digest))throw new Error('morning digest must not read or expose raw location/device sources');
for(const sentinel of [
  "import { D1LocationQueryService } from './location-query-service';",
  'service.historyForSubjects({',
  'history.some(point=>',
  'previousDate',
  'localDate',
])if(!locationSummary.includes(sentinel))throw new Error(`privacy-safe location summary missing: ${sentinel}`);
if(/latitude|longitude/.test(locationSummary.match(/export type LocationDigestDayFacts[\s\S]*?};/)?.[0]||''))throw new Error('digest-facing Location fact type must not expose coordinates');

for(const sentinel of [
  'line_daily_digest_ai_family_daily',
  'line_daily_digest_ai_global_daily',
  'reserveMorningDigestAiRequest',
  'finalizeMorningDigestFrame',
  'blockMorningDigestAiAfter429',
])if(!aiGuard.includes(sentinel))throw new Error(`morning AI guard implementation missing: ${sentinel}`);
for(const sentinel of [
  'CREATE TABLE IF NOT EXISTS line_daily_digest_ai_family_daily',
  'CREATE TABLE IF NOT EXISTS line_daily_digest_ai_global_daily',
  'CHECK(request_count BETWEEN 0 AND 2)',
])if(!aiGuardMigration.includes(sentinel))throw new Error(`morning AI guard schema missing: ${sentinel}`);

console.log('LINE daily digest modularity contract: enabled family/recipient gates, stable retry idempotency, bounded task-only advice, privacy-safe location summaries, weather, fortune and persisted AI cost guards ok');
