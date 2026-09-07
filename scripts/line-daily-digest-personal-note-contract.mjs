import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  "type Frame={opener:string;closing:string;personalNote?:string;narrativeVersion?:3}",
  'type StoredMorningRecap={recap:string|null;narrativeVersion:3}',
  'MAX_MORNING_NARRATIVE_CHARS=320',
  'function morningNarrativeEvidence(payload:DigestFactPayload,weather:MorningWeatherFact|null)',
  'previous_date:payload.previousDate',
  'yesterday_family_log:payload.familyLog.previous.slice(0,12)',
  'today_events:payload.today.events.slice(0,5)',
  'today_tasks:payload.today.tasks.slice(0,6)',
  'today_bring_items:payload.today.bringItems.slice(0,8)',
  'profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'personality_note',
  '文章全体をひとつの自由な統括として書き、定型文の穴埋めではなく、毎日言い回し・着眼点・リズムが変わって構いません',
  '返答はJSONだけで {"recap":"..."}',
  '昨日できたことを具体的に認め、今日の予定・天気・タスク等から役立つ一言へ自然につないでください',
  '冒頭あいさつと締めの定型文はサーバー側で付けるため、recapには不要です',
  '原文を引用・羅列せず、プロフィールを読んだことも明かさないでください',
  '事実はevidenceにある内容だけを使い、無い出来事・感情・成果を作らないでください',
  'PRIVATEタスク、raw GPS、座標はevidenceに入っていないため推測しないでください',
  '正確な数字・件数・時刻・日付は後段の一覧が担当するため',
  'const parsed=JSON.parse(text),recap=clean(parsed?.recap,MAX_MORNING_NARRATIVE_CHARS)',
  'const frame:Frame={...fallbackBase,personalNote:recap,narrativeVersion:3}',
  'function profileLeakFragments(profiles:FamilyAiSafeProfileContext[]):string[]',
  'if(profile.birth_facts?.zodiac)add(profile.birth_facts.zodiac)',
  'add(`${profile.blood_type}型`)',
  'function generatedRecapPassesSafety(recap:string,profiles:FamilyAiSafeProfileContext[]):boolean',
  'if(profileLeakFragments(profiles).some(fragment=>normalized.includes(fragment)))return false',
  'if(recap&&generatedRecapPassesSafety(recap,profiles))',
  'persistedMorningFrame(persisted,fallbackFrame,profiles)',
  'narrativeVersion:3',
  'if(Number(value.narrativeVersion)!==3)return null',
  'if(value.recap===null)return fallbackFrame',
  'const stored:StoredMorningRecap={recap,narrativeVersion:3}',
  'await finalizeRecapSafely(env,familyId,localDate,recap)',
  'await finalizeRecapSafely(env,familyId,localDate,null)',
  'if(!sharedAiFacts)sharedAiFacts=await buildFactPayload(env,Number(setting.family_id),0,localDate,EMPTY_LOCATION_FACTS)',
  'frame??=await chooseFrame(env,toneLevel(setting.tone_level),Number(setting.family_id),localDate,sharedAiFacts,weatherFact)',
  'function buildEvidencePraise(payload:DigestFactPayload):string[]',
  'const authoritativeText=fitMorningDigest(authoritative,requiredSuffix)',
  'const fullAuthoritativeLength=[...authoritative,...requiredSuffix].join',
  'if(available<8)return authoritativeText',
])if(!digest.includes(marker))throw new Error(`morning freeform recap marker missing: ${marker}`);

if(digest.includes('{"opener":"...","narrative":"...","closing":"..."}'))throw new Error('Gemini must not author the morning opener/closing frame');
if((digest.match(/geminiFetch\(env,model,body\)/g)||[]).length!==1)throw new Error('morning digest must retain exactly one Gemini call site');
if(!digest.includes("if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return fallbackFrame"))throw new Error('provider/config bypass must retain deterministic fallback');
if(!digest.includes('Optional personalization context must never block the deterministic morning digest'))throw new Error('profile lookup failure must remain non-blocking');
if(!digest.includes('blood_type:profile.blood_type'))throw new Error('safe profile projection shape unexpectedly changed');
if(!digest.includes('血液型・性別/ジェンダー・出身地・年齢・星座を本文へ直接書かず'))throw new Error('sensitive-attribute anti-disclosure prompt guard missing');

const evidenceStart=digest.indexOf('function morningNarrativeEvidence('),evidenceEnd=digest.indexOf('\nasync function chooseFrame(',evidenceStart);
const evidenceBody=evidenceStart>=0&&evidenceEnd>evidenceStart?digest.slice(evidenceStart,evidenceEnd):'';
if(!evidenceBody)throw new Error('shared AI evidence builder missing');
if(/location|latitude|longitude|private_owner_id/i.test(evidenceBody))throw new Error('AI narrative evidence must not include location/raw GPS/private-owner fields');

const safetyStart=digest.indexOf('function generatedRecapPassesSafety('),safetyEnd=digest.indexOf('\nfunction persistedMorningFrame(',safetyStart);
const safetyBody=safetyStart>=0&&safetyEnd>safetyStart?digest.slice(safetyStart,safetyEnd):'';
if(!safetyBody.includes('profileLeakFragments(profiles)'))throw new Error('server-side profile leak validator missing');
if(!/https\?:\\\/\\\/|www/.test(safetyBody))throw new Error('generated output URL rejection missing');
if(!safetyBody.includes('[0-9０-９〇零一二三四五六七八九十百千万億兆]'))throw new Error('generated recap must reject numeric claims and leave numbers to deterministic facts');
if(/frame\.(?:opener|closing|personalNote)|FRAME_OPTIONS/.test(safetyBody))throw new Error('untrusted recap validation must not inspect trusted server-owned frame copy');

const profileLeakStart=digest.indexOf('function profileLeakFragments('),profileLeakEnd=digest.indexOf('\nfunction generatedRecapPassesSafety(',profileLeakStart);
const profileLeakBody=profileLeakStart>=0&&profileLeakEnd>profileLeakStart?digest.slice(profileLeakStart,profileLeakEnd):'';
if(!profileLeakBody.includes('profile.birth_facts?.zodiac')||!profileLeakBody.includes('`${profile.blood_type}型`'))throw new Error('structured zodiac/blood-type display forms must be protected as hidden context');

const persistedStart=digest.indexOf('function persistedMorningFrame('),persistedEnd=digest.indexOf('\nasync function finalizeRecapSafely(',persistedStart);
const persistedBody=persistedStart>=0&&persistedEnd>persistedStart?digest.slice(persistedStart,persistedEnd):'';
if(!persistedBody.includes('if(value.recap===null)return fallbackFrame'))throw new Error('finalized deterministic fallback marker must reconstruct the current server-owned frame');
if(!persistedBody.includes('generatedRecapPassesSafety(recap,profiles)'))throw new Error('persisted generated recap must be revalidated before reuse');
if(!persistedBody.includes('{...fallbackFrame,personalNote:recap,narrativeVersion:3}'))throw new Error('persisted recap must be wrapped in the current deterministic server shell');
if(/value\.(?:opener|closing|personalNote)/.test(persistedBody))throw new Error('persisted AI data must not restore opener/closing/personalNote from the old full-frame format');

const finalizeStart=digest.indexOf('async function finalizeRecapSafely('),finalizeEnd=digest.indexOf('\nfunction morningNarrativeEvidence(',finalizeStart);
const finalizeBody=finalizeStart>=0&&finalizeEnd>finalizeStart?digest.slice(finalizeStart,finalizeEnd):'';
if(!finalizeBody.includes('const stored:StoredMorningRecap={recap,narrativeVersion:3}'))throw new Error('morning AI persistence must store recap-only v3 data');
if(/JSON\.stringify\(frame\)/.test(finalizeBody))throw new Error('morning AI persistence must not store a full generated frame');

const chooseStart=digest.indexOf('async function chooseFrame('),chooseEnd=digest.indexOf('\nfunction logFact(',chooseStart);
const chooseBody=chooseStart>=0&&chooseEnd>chooseStart?digest.slice(chooseStart,chooseEnd):'';
if(!chooseBody||/(Routes|Maps|Search grounding)/.test(chooseBody))throw new Error('morning recap must not add Maps/Routes/Search providers');
if(!chooseBody.includes('maxOutputTokens:360'))throw new Error('bounded Gemini output token limit missing');
if(/SELECT |INSERT |UPDATE |DELETE /i.test(chooseBody))throw new Error('Gemini recap function must not perform arbitrary DB fact queries');
if(!chooseBody.includes('generatedRecapPassesSafety(recap,profiles)'))throw new Error('Gemini-authored recap must pass server-side validation before persistence/broadcast');
if(!chooseBody.includes('const frame:Frame={...fallbackBase,personalNote:recap,narrativeVersion:3}'))throw new Error('server must own deterministic opener/closing around the Gemini recap');
if(/generatedFramePassesSafety/.test(chooseBody))throw new Error('trusted deterministic opener/closing must not be included in untrusted recap validation');
if(/parsed\?\.(?:opener|closing|narrative)/.test(chooseBody))throw new Error('Gemini response must be consumed only as one freeform recap block');

const processStart=digest.indexOf('export async function processLineDailyDigests(');
const processBody=processStart>=0?digest.slice(processStart):'';
if(!processBody.includes('buildFactPayload(env,Number(setting.family_id),0,localDate,EMPTY_LOCATION_FACTS)'))throw new Error('shared Gemini facts must be built with FAMILY-only task visibility');
if((processBody.match(/chooseFrame\(/g)||[]).length!==1)throw new Error('frame/recap must be generated once and reused across recipients');

const renderStart=digest.indexOf('function renderDeterministicFacts('),renderEnd=digest.indexOf('\nexport async function processLineDailyDigests(',renderStart);
const renderBody=renderStart>=0&&renderEnd>renderStart?digest.slice(renderStart,renderEnd):'';
if(renderBody.indexOf('const authoritativeText=fitMorningDigest(authoritative,requiredSuffix)')>renderBody.indexOf('const narrative='))throw new Error('authoritative sections must be budgeted before optional recap');
if(!renderBody.includes('MAX_MORNING_DIGEST_CHARS-fullAuthoritativeLength'))throw new Error('recap must use only capacity left after authoritative sections');

const praiseStart=digest.indexOf('function buildEvidencePraise('),praiseEnd=digest.indexOf('\nfunction fitMorningDigest(',praiseStart);
const praiseBody=praiseStart>=0&&praiseEnd>praiseStart?digest.slice(praiseStart,praiseEnd):'';
if(!praiseBody||/(geminiFetch|fetch\(|Routes|Maps)/.test(praiseBody))throw new Error('evidence praise must remain deterministic and local');

await import('./line-daily-digest-weather-contract.mjs');
console.log('line-daily-digest-personal-note-contract: one bounded Gemini call may synthesize one freeform evidence-grounded recap; only that recap is treated as untrusted AI output and persisted, while the server owns opener/closing, hidden-profile/numeric-claim rejection, and authoritative-section budgeting');