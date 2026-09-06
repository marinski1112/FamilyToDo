import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');
const settings=fs.readFileSync('src/settings-notifications-page.ts','utf8');
const browser=fs.readFileSync('public/assets/settings-notifications.js','utf8');
const migration=fs.readFileSync('migrations/0055_line_daily_digest_family_summary.sql','utf8');
const locationSummary=fs.readFileSync('src/location-day-summary.ts','utf8');

for(const marker of [
  "import { buildLocationDigestDayFacts, type LocationDigestDayFacts } from './location-day-summary'",
  'const EMPTY_LOCATION_FACTS:LocationDigestDayFacts={previous:[],today:[]}',
  'buildLocationDigestDayFacts({',
  'requesterMemberId',
  'previousDate:dateBefore(localDate)',
  'timeZone:timezone',
  "if(payload.location.previous.length){authoritative.push('【昨日の移動】'",
  "if(payload.location.today.length){authoritative.push('【今日の移動】'",
])if(!digest.includes(marker))throw new Error(`morning digest location summary wiring missing: ${marker}`);

if(!/visibility_scope='FAMILY' OR \(visibility_scope='PRIVATE' AND private_owner_id=\?\)/.test(digest))throw new Error('morning task facts must preserve recipient private visibility boundary');
if(!digest.includes('buildFactPayload(env,Number(setting.family_id),0,localDate,EMPTY_LOCATION_FACTS)'))throw new Error('shared Gemini facts must remain FAMILY-only and location-free');
if(!digest.includes('buildFactPayload(env,Number(setting.family_id),Number(member.id),localDate,locationFacts)'))throw new Error('recipient facts must be rendered with the current recipient boundary');

const evidenceStart=digest.indexOf('function morningNarrativeEvidence('),evidenceEnd=digest.indexOf('\nasync function chooseFrame(',evidenceStart);
const evidenceBody=evidenceStart>=0&&evidenceEnd>evidenceStart?digest.slice(evidenceStart,evidenceEnd):'';
if(!evidenceBody||/location|latitude|longitude|location_history|owntracks|device_id|public_device_id|secret/i.test(evidenceBody))throw new Error('shared Gemini evidence must not include raw or summarized location/device data');

const adviceStart=digest.indexOf('function buildDeterministicAdvice('),adviceEnd=digest.indexOf('\nfunction buildEvidencePraise(',adviceStart);
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
const rawDataAccessPatterns=[/\b(?:FROM|JOIN)\s+(?:member_)?location_(?:history|devices?)\b/i,/\bowntracks\b.*\b(?:SELECT|FROM|JOIN|prepare)\b/i,/\b(?:latitude|longitude|public_device_id|device_id)\b\s*(?:,|FROM|JOIN|WHERE|=\?)/i];
if(rawDataAccessPatterns.some(pattern=>pattern.test(digest)))throw new Error('morning digest must not directly read raw location/device sources');
for(const sentinel of [
  "import { D1LocationQueryService } from './location-query-service';",
  'service.historyForSubjects({',
  'Disabled/revoked/non-sharing',
  'MIN_SEGMENT_METERS=25',
  'return EMPTY_FACTS',
]){
  if(!locationSummary.includes(sentinel))throw new Error(`privacy-safe location summary boundary missing: ${sentinel}`);
}

console.log('line-daily-digest-modularity-contract: settings, recipient visibility, FAMILY-only AI evidence, and privacy-safe location summary boundaries ok');
