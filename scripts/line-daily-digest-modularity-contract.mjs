import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');
const profileContext=fs.readFileSync('src/family-ai-profile-context.ts','utf8');
const locationSummary=fs.readFileSync('src/location-day-summary.ts','utf8');
const settings=fs.readFileSync('src/settings-notifications-page.ts','utf8');
const browser=fs.readFileSync('public/assets/settings-notifications.js','utf8');
const migration=fs.readFileSync('migrations/0055_line_daily_digest_family_summary.sql','utf8');
const workerTypes=fs.readFileSync('worker-configuration.d.ts','utf8');

if(!index.includes("import { processLineDailyDigests } from './line-daily-digest';")) throw new Error('index.ts must import LINE daily digest job');
if(index.includes('export async function processLineDailyDigests(')) throw new Error('index.ts must not retain LINE daily digest job');
if(!index.includes("ctx.waitUntil(processLineDailyDigests(env));")) throw new Error('scheduled handler must retain LINE daily digest invocation');
if(!digest.includes('export async function processLineDailyDigests(env:Env):Promise<void>{')) throw new Error('LINE daily digest module must export its scheduled job');
for(const sentinel of [
  'line_daily_digest_settings',
  'line_daily_digest_recipients',
  'line_daily_digest_receipts',
  'line_daily_digest_subject_settings',
  "current<target||current>target+29",
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  "familyAiProvider(env)!=='GEMINI'",
  'renderDeterministicFacts',
  'buildDeterministicAdvice',
  '【今日のヒント】',
  'FAMILY_LOG_TYPE_META',
  "COALESCE(ds.enabled,1)=1",
  "Number(receipt.attempt_count)>=3",
  "message=renderDeterministicFacts",
  'buildLocationDigestDayFacts',
  '【昨日の移動】',
  '【今日の移動】',
]){
  if(!digest.includes(sentinel)) throw new Error(`LINE daily digest behavior sentinel missing: ${sentinel}`);
}
for(const sentinel of [
  "MORNING_DIGEST_GEMINI_MODEL_PRIMARY_DEFAULT='gemini-3.8-flash'",
  "MORNING_DIGEST_GEMINI_MODEL_FALLBACK_DEFAULT='gemini-3.5-flash'",
  'env.MORNING_DIGEST_GEMINI_MODEL_PRIMARY',
  'env.MORNING_DIGEST_GEMINI_MODEL_FALLBACK',
  'env.MORNING_DIGEST_AI_ENABLED',
  'for(const model of morningDigestModels(env))',
  'return options[0];',
]){
  if(!digest.includes(sentinel)) throw new Error(`dedicated morning Gemini route missing: ${sentinel}`);
}
for(const sentinel of [
  "import { loadSafeFamilyAiProfileContext, type FamilyAiSafeProfileContext } from './family-ai-profile-context';",
  'MAX_MORNING_PROFILE_SUBJECTS=8',
  'MAX_MORNING_PROFILE_CONTEXT_CHARS=2400',
  'morningProfilePromptContext(',
  'await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'Optional personalization context must never block the deterministic morning digest',
]){
  if(!digest.includes(sentinel)) throw new Error(`privacy-safe morning profile context missing: ${sentinel}`);
}
for(const sentinel of [
  'ai_personalization_enabled=1',
  'parseAiProfilePermissions(row.ai_profile_permissions_json)',
  "permissions.has('personality')",
  "permissions.has('birth_facts')",
  'return {age,zodiac};',
]){
  if(!profileContext.includes(sentinel)) throw new Error(`AI profile projection boundary missing: ${sentinel}`);
}
if(/FROM\s+family_log_subjects/i.test(digest))throw new Error('morning digest must not bypass the AI profile projection with direct profile-table reads');
for(const sentinel of ['MORNING_DIGEST_AI_ENABLED?:string','MORNING_DIGEST_GEMINI_MODEL_PRIMARY?:string','MORNING_DIGEST_GEMINI_MODEL_FALLBACK?:string']){
  if(!workerTypes.includes(sentinel)) throw new Error(`morning digest server config typing missing: ${sentinel}`);
}
if(digest.includes('resolveFamilyGeminiModel'))throw new Error('morning digest must not inherit FamilyAI/global family model selection');
if((digest.match(/await geminiFetch\(/g)||[]).length!==1)throw new Error('morning digest source must keep one bounded model-call site');
const receiptGate=digest.indexOf("Number(receipt.attempt_count)>=3)continue");
const locationRead=digest.indexOf('await buildLocationDigestDayFacts({',receiptGate);
const frameInvocation=digest.indexOf('frame??=await chooseFrame(',receiptGate);
const chooseFrameStart=digest.indexOf('async function chooseFrame(');
const chooseFrameEnd=digest.indexOf('\nfunction logFact(',chooseFrameStart);
const chooseFrameBody=chooseFrameStart>=0&&chooseFrameEnd>chooseFrameStart?digest.slice(chooseFrameStart,chooseFrameEnd):'';
const aiEligibilityGuard=chooseFrameBody.indexOf("familyAiProvider(env)!=='GEMINI'");
const profileLoader=chooseFrameBody.indexOf('await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)');
if(receiptGate<0||locationRead<0||locationRead<receiptGate){
  throw new Error('optional Location history must be deferred until after receipt SENT/retry gating');
}
if(receiptGate<0||frameInvocation<0||frameInvocation<receiptGate||profileLoader<0||aiEligibilityGuard<0||profileLoader<aiEligibilityGuard){
  throw new Error('optional AI profile context must be reached only after receipt gating and the morning Gemini eligibility guard');
}
const authoritativeMarkers=['【今日の記録】','【今日の予定】','【今日のタスク】','【今日のヒント】'];
const firstLocation=Math.min(...['【昨日の移動】','【今日の移動】'].map(marker=>digest.indexOf(marker)).filter(index=>index>=0));
if(firstLocation<0||authoritativeMarkers.some(marker=>digest.indexOf(marker)<0||digest.indexOf(marker)>firstLocation)){
  throw new Error('authoritative Family Log/schedule/task/advice sections must render before optional Location enrichment');
}
const adviceStart=digest.indexOf('function buildDeterministicAdvice('),adviceEnd=digest.indexOf('\nfunction renderDeterministicFacts(',adviceStart);
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
if(locationSummary.includes('service.history({'))throw new Error('family-wide Location summaries must not regress to one D1 history statement per member');
if(locationSummary.includes('console.'))throw new Error('location digest summary must not log location-derived data');
console.log('LINE daily digest modularity contract: ok');