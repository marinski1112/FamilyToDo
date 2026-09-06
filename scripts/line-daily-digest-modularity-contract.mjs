import fs from 'node:fs';

const source=fs.readFileSync('src/index.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');
const aiGuard=fs.readFileSync('src/line-daily-digest-ai-guard.ts','utf8');
const settings=fs.readFileSync('src/settings-notifications-page.ts','utf8');
const browser=fs.readFileSync('public/assets/settings-notifications.js','utf8');
const migration=fs.readFileSync('migrations/0057_line_daily_digest_ai_profile.sql','utf8');
const aiGuardMigration=fs.readFileSync('migrations/0058_line_daily_digest_ai_guard.sql','utf8');
const locationSummary=fs.readFileSync('src/location-day-summary.ts','utf8');

for(const sentinel of [
  "import { processLineDailyDigests } from './line-daily-digest';",
  'await processLineDailyDigests(env)',
]){
  if(!source.includes(sentinel))throw new Error(`daily digest scheduler boundary missing: ${sentinel}`);
}
for(const sentinel of [
  'export async function processLineDailyDigests(env:Env):Promise<void>',
  'line_daily_digest_receipts',
  "status='SENT'",
  'attempt_count>=3',
  'X-Line-Retry-Key',
  'morningDigestRetryKey',
  "bytes[6]=(bytes[6]&0x0f)|0x80",
  "bytes[8]=(bytes[8]&0x3f)|0x80",
  'MAX_MORNING_DIGEST_CHARS=1000',
  'fitMorningDigest(lines,requiredSuffix)',
  "['【お楽しみ占い】'",
  'buildLocationDigestDayFacts',
  'buildDeterministicAdvice',
  'dailyFortune',
  "familyAiProvider(env)!=='GEMINI'",
  'MORNING_DIGEST_GEMINI_MODEL_PRIMARY_DEFAULT',
  'MORNING_DIGEST_GEMINI_MODEL_FALLBACK_DEFAULT',
  'readFinalizedMorningDigestFrame',
  'reserveMorningDigestAiRequest',
  'blockMorningDigestAiAfter429',
  'finalizeMorningDigestFrame',
  'loadSafeFamilyAiProfileContext',
  'note_candidates=',
  'profile_context=',
  'maxOutputTokens:100',
]){
  if(!digest.includes(sentinel))throw new Error(`daily digest runtime marker missing: ${sentinel}`);
}
if((digest.match(/geminiFetch\(env,model,body\)/g)||[]).length!==1)throw new Error('morning digest must retain one Gemini live call site');
if(!digest.includes("return primary===fallback?[primary]:[primary,fallback]"))throw new Error('morning model fallback must remain bounded to at most one fallback');
if(!digest.includes("if(!reserved){await finalizeFrameSafely(env,familyId,localDate,options[0]);return options[0];}"))throw new Error('morning budget denial must fail closed to deterministic frame');
if(!digest.includes('if(response.status===429)'))throw new Error('morning Gemini 429 must trigger circuit handling');
if(!digest.includes('One bounded fallback model attempt follows'))throw new Error('morning Gemini failure path must remain bounded');
if(!digest.includes("return options[0];/* Missing/unavailable guard storage fails closed to deterministic prose. */"))throw new Error('missing AI guard storage must fail closed without live paid calls');
if(!digest.includes('Cost guard persistence must not block deterministic LINE delivery'))throw new Error('AI frame persistence failure must not block deterministic fallback delivery');
if(!digest.includes("if(frame.personalNote)lines.push('【家族のひとこと】"))throw new Error('morning personal note must remain bounded in deterministic renderer');
if(!digest.includes('決定論的な予定・記録の事実を変更しないでください'))throw new Error('morning AI must not alter deterministic fact authority');
if(/Search|grounding|googleSearch|maps/i.test(digest.slice(digest.indexOf('async function chooseFrame('),digest.indexOf('\nfunction logFact('))))throw new Error('morning AI selector must not use Search/Maps grounding');

for(const sentinel of [
  'MORNING_DIGEST_AI_FAMILY_DAILY_LIMIT',
  'MORNING_DIGEST_AI_GLOBAL_DAILY_LIMIT',
  'MORNING_DIGEST_AI_CIRCUIT_MINUTES',
  'MORNING_DIGEST_AI_ENABLED',
  'line_daily_digest_ai_daily_usage',
  'line_daily_digest_ai_daily_frames',
  'line_daily_digest_ai_circuit',
  'BEGIN IMMEDIATE',
]){
  if(!aiGuard.includes(sentinel))throw new Error(`morning digest AI cost guard missing: ${sentinel}`);
}
if(!aiGuardMigration.includes('line_daily_digest_ai_daily_usage')||!aiGuardMigration.includes('line_daily_digest_ai_daily_frames')||!aiGuardMigration.includes('line_daily_digest_ai_circuit'))throw new Error('morning digest AI guard migration missing');

const receiptGate=digest.indexOf("String(receipt.status)==='SENT'");
const locationRead=digest.indexOf('await buildLocationDigestDayFacts({',receiptGate);
const frameInvocation=digest.indexOf('frame??=await chooseFrame(',receiptGate);
const chooseFrameStart=digest.indexOf('async function chooseFrame(');
const chooseFrameEnd=digest.indexOf('\nfunction logFact(',chooseFrameStart);
const chooseFrameBody=chooseFrameStart>=0&&chooseFrameEnd>chooseFrameStart?digest.slice(chooseFrameStart,chooseFrameEnd):'';
const aiEligibilityGuard=chooseFrameBody.indexOf("familyAiProvider(env)!=='GEMINI'");
const persistedGuardRead=chooseFrameBody.indexOf('await readFinalizedMorningDigestFrame(env.DB,familyId,localDate)');
const profileLoader=chooseFrameBody.indexOf('await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)');
const reservation=chooseFrameBody.indexOf('reserveMorningDigestAiRequest(env.DB,familyId,localDate,attempt>0)');
const liveGemini=chooseFrameBody.indexOf('await geminiFetch(env,model,body)');
if(receiptGate<0||locationRead<0||locationRead<receiptGate){
  throw new Error('optional Location history must be deferred until after receipt SENT/retry gating');
}
if(receiptGate<0||frameInvocation<0||frameInvocation<receiptGate||persistedGuardRead<0||profileLoader<0||aiEligibilityGuard<0||persistedGuardRead<aiEligibilityGuard||profileLoader<persistedGuardRead){
  throw new Error('optional AI profile context must be reached only after receipt gating, Gemini eligibility and persisted daily guard');
}
if(reservation<0||liveGemini<0||reservation>liveGemini)throw new Error('every morning Gemini live call must reserve bounded daily budget first');
const authoritativeMarkers=['【今日の記録】','【今日の予定】','【今日のタスク】','【今日のヒント】'];
const firstLocation=Math.min(...['【昨日の移動】','【今日の移動】'].map(marker=>digest.indexOf(marker)).filter(index=>index>=0));
if(firstLocation<0||authoritativeMarkers.some(marker=>digest.indexOf(marker)<0||digest.indexOf(marker)>firstLocation)){
  throw new Error('authoritative Family Log/schedule/task/advice sections must render before optional Location enrichment');
}
const adviceStart=digest.indexOf('function buildDeterministicAdvice('),adviceEnd=digest.indexOf('\nfunction morningVariant(',adviceStart);
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
  'Disabled/revoked/non-sharing',
  'MIN_SEGMENT_METERS=25',
  'return EMPTY_FACTS',
]){
  if(!locationSummary.includes(sentinel))throw new Error(`privacy-safe location summary boundary missing: ${sentinel}`);
}

console.log('LINE daily digest modularity contract: receipt/retry/idempotency, deterministic facts/advice/fortune/praise, privacy-safe Location projection, bounded shared-family AI frame, persisted cost guard, and notification controls ok');
