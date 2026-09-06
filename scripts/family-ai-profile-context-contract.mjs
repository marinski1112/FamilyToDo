import fs from 'node:fs';

const helper=fs.readFileSync('src/family-ai-profile-context.ts','utf8');
const familyAi=fs.readFileSync('src/family-ai.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  'export async function loadSafeFamilyAiProfileContext',
  'WHERE family_id=? AND active=1 AND ai_personalization_enabled=1',
  'ai_profile_permissions_json',
  'export const AI_PROFILE_PERMISSION_KEYS',
  'parseAiProfilePermissions',
  "permissions.has('personality')",
  "permissions.has('birth_facts')",
  "permissions.has('birthplace')",
  "permissions.has('sex_gender')",
  "permissions.has('blood_type')",
  'MAX_PERSONALITY_CONTEXT_CHARS=320',
  'MAX_BIRTHPLACE_CONTEXT_CHARS=80',
  'MAX_SEX_GENDER_CONTEXT_CHARS=40',
  'subject_ref:`S${id}`',
  'export function deriveBirthFactsForExplicitPermission',
  'return {age,zodiac};',
])if(!helper.includes(marker))throw new Error(`AI profile safe projection marker missing: ${marker}`);

if(/birth_date\s*[:=]\s*row\.birth_date/.test(helper)||/birth_year/.test(helper)||helper.includes('birth_month_day'))throw new Error('reconstructable raw birth date/year components must never be returned from the AI profile boundary');
if(/personality_note\s*:\s*row\.personality_note/.test(helper))throw new Error('personality memo must pass through the bounded clamp before projection');
if(!helper.includes("Array.from(String(value??'').trim()).slice(0,max).join('')"))throw new Error('Unicode-safe context clamp missing');
for(const field of ['personality_note','birthplace','sex_gender','blood_type']){
  if(!helper.includes(field))throw new Error(`expected field-level projection support missing: ${field}`);
}
for(const source of [familyAi,digest]){
  if(source.includes("from './family-ai-profile-context'"))throw new Error('profile projection must remain unwired from Gemini/digest in this bounded scope');
}
if(helper.includes('generateContent')||helper.includes('GEMINI_API_KEY')||helper.includes('geminiFetch('))throw new Error('profile projection helper must not call Gemini');

console.log('family-ai-profile-context-contract: master opt-in + field-level permissions, family scope, non-reconstructable birth facts, bounded text and no Gemini wiring ok');
