import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  "type Frame={opener:string;closing:string;personalNote?:string;narrativeVersion?:2}",
  'MAX_MORNING_NARRATIVE_CHARS=320',
  'function morningNarrativeEvidence(payload:DigestFactPayload,weather:MorningWeatherFact|null)',
  'previous_date:payload.previousDate',
  'yesterday_family_log:payload.familyLog.previous.slice(0,12)',
  'today_events:payload.today.events.slice(0,5)',
  'today_tasks:payload.today.tasks.slice(0,6)',
  'today_bring_items:payload.today.bringItems.slice(0,8)',
  'profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'personality_note',
  '定型文の穴埋めではなく、毎日言い回し・着眼点・リズムが変わって構いません',
  '昨日できたことを具体的に認め、今日の予定・天気・タスク等から役立つ一言へ自然につないでください',
  '原文を引用・羅列せず、プロフィールを読んだことも明かさないでください',
  '事実はevidenceにある内容だけを使い、無い出来事・感情・成果を作らないでください',
  'PRIVATEタスク、raw GPS、座標はevidenceに入っていないため推測しないでください',
  'const parsed=JSON.parse(text),opener=clean(parsed?.opener,80),personalNote=clean(parsed?.narrative,MAX_MORNING_NARRATIVE_CHARS),closing=clean(parsed?.closing,80)',
  'narrativeVersion:2',
  'if(Number(value.narrativeVersion)!==2)return null',
  'if(!sharedAiFacts)sharedAiFacts=await buildFactPayload(env,Number(setting.family_id),0,localDate,EMPTY_LOCATION_FACTS)',
  'frame??=await chooseFrame(env,toneLevel(setting.tone_level),Number(setting.family_id),localDate,sharedAiFacts,weatherFact)',
  'function buildEvidencePraise(payload:DigestFactPayload):string[]',
  "if(frame.personalNote)lines.push(`💬 ${frame.personalNote}`)",
])if(!digest.includes(marker))throw new Error(`morning natural narrative marker missing: ${marker}`);

if((digest.match(/geminiFetch\(env,model,body\)/g)||[]).length!==1)throw new Error('morning digest must retain exactly one Gemini call site');
if(!digest.includes("if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return fallbackFrame"))throw new Error('provider/config bypass must retain deterministic fallback');
if(!digest.includes('Optional personalization context must never block the deterministic morning digest'))throw new Error('profile lookup failure must remain non-blocking');
if(!digest.includes('blood_type:profile.blood_type'))throw new Error('safe profile projection shape unexpectedly changed');
if(!digest.includes('血液型・性別/ジェンダー・出身地を性格・健康・能力の因果根拠にしないでください'))throw new Error('sensitive-attribute anti-inference prompt guard missing');

const evidenceStart=digest.indexOf('function morningNarrativeEvidence('),evidenceEnd=digest.indexOf('\nasync function chooseFrame(',evidenceStart);
const evidenceBody=evidenceStart>=0&&evidenceEnd>evidenceStart?digest.slice(evidenceStart,evidenceEnd):'';
if(!evidenceBody)throw new Error('shared AI evidence builder missing');
if(/location|latitude|longitude|private_owner_id/i.test(evidenceBody))throw new Error('AI narrative evidence must not include location/raw GPS/private-owner fields');

const chooseStart=digest.indexOf('async function chooseFrame('),chooseEnd=digest.indexOf('\nfunction logFact(',chooseStart);
const chooseBody=chooseStart>=0&&chooseEnd>chooseStart?digest.slice(chooseStart,chooseEnd):'';
if(!chooseBody||/(Routes|Maps|Search grounding)/.test(chooseBody))throw new Error('morning narrative must not add Maps/Routes/Search providers');
if(!chooseBody.includes('maxOutputTokens:360'))throw new Error('bounded Gemini output token limit missing');
if(/SELECT |INSERT |UPDATE |DELETE /i.test(chooseBody))throw new Error('Gemini narrative function must not perform arbitrary DB fact queries');

const processStart=digest.indexOf('export async function processLineDailyDigests(');
const processBody=processStart>=0?digest.slice(processStart):'';
if(!processBody.includes('buildFactPayload(env,Number(setting.family_id),0,localDate,EMPTY_LOCATION_FACTS)'))throw new Error('shared Gemini facts must be built with FAMILY-only task visibility');
if((processBody.match(/chooseFrame\(/g)||[]).length!==1)throw new Error('frame/narrative must be generated once and reused across recipients');

const praiseStart=digest.indexOf('function buildEvidencePraise('),praiseEnd=digest.indexOf('\nfunction fitMorningDigest(',praiseStart);
const praiseBody=praiseStart>=0&&praiseEnd>praiseStart?digest.slice(praiseStart,praiseEnd):'';
if(!praiseBody||/(geminiFetch|fetch\(|Routes|Maps)/.test(praiseBody))throw new Error('evidence praise must remain deterministic and local');

await import('./line-daily-digest-weather-contract.mjs');
console.log('line-daily-digest-personal-note-contract: one bounded Gemini call synthesizes a natural grounded morning narrative from FAMILY-only evidence; deterministic fallback/privacy guards remain');
