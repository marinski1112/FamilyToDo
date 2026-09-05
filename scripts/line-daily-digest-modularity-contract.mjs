import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');
const locationSummary=fs.readFileSync('src/location-day-summary.ts','utf8');
const settings=fs.readFileSync('src/settings-notifications-page.ts','utf8');
const browser=fs.readFileSync('public/assets/settings-notifications.js','utf8');
const migration=fs.readFileSync('migrations/0055_line_daily_digest_family_summary.sql','utf8');

if(!index.includes("import { processLineDailyDigests } from './line-daily-digest';")) throw new Error('index.ts must import LINE daily digest job');
if(index.includes('export async function processLineDailyDigests(')) throw new Error('LINE daily digest job must not remain defined in index.ts');
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
for(const sentinel of ['digest_tone','digest_subjects','FRIENDLY_LIGHT']){
  if(!settings.includes(sentinel)||!browser.includes(sentinel)) throw new Error(`digest settings control missing: ${sentinel}`);
}
if(!settings.includes('line_daily_digest_subject_settings'))throw new Error('digest settings must persist subject inclusion server-side');
if(!migration.includes("DEFAULT 'FRIENDLY_LIGHT'"))throw new Error('digest tone must default to friendly/light humor');
if(!migration.includes('enabled INTEGER NOT NULL DEFAULT 1'))throw new Error('digest subject inclusion must default ON');
if(/latitude|longitude|location_history|owntracks|device_id|public_device_id|secret/i.test(digest))throw new Error('morning digest must not read or expose raw location/device sources');
for(const sentinel of [
  "import { D1LocationQueryService } from './location-query-service';",
  'service.history({',
  'sharing, non-revoked',
  'MIN_SEGMENT_METERS=25',
  'return EMPTY_FACTS',
]){
  if(!locationSummary.includes(sentinel))throw new Error(`privacy-safe location summary boundary missing: ${sentinel}`);
}
if(/address|raw payload|authorization/i.test(locationSummary.replace(/Raw coordinates, device identifiers, addresses and\n \* provider payloads never leave this module\./i,''))){
  throw new Error('location digest summary must not add address/raw authorization handling');
}
console.log('LINE daily digest modularity contract: ok');
