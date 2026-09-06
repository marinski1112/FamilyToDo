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
if(familyAi.includes("from './family-ai-profile-context'"))throw new Error('general FamilyAI path must remain unwired from profile projection in this bounded scope');
for(const marker of [
  "from './family-ai-profile-context'",
  'await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'MAX_MORNING_PROFILE_SUBJECTS=8',
  'MAX_MORNING_PROFILE_CONTEXT_CHARS=2400',
  'Optional personalization context must never block the deterministic morning digest',
])if(!digest.includes(marker))throw new Error(`bounded morning digest profile wiring marker missing: ${marker}`);
if(/FROM\s+family_log_subjects/i.test(digest))throw new Error('morning digest must consume the privacy boundary instead of reading raw profile columns directly');
if(helper.includes('generateContent')||helper.includes('GEMINI_API_KEY')||helper.includes('geminiFetch('))throw new Error('profile projection helper must not call Gemini');

console.log('family-ai-profile-context-contract: master opt-in + field permissions stay in the projection boundary; only bounded morning digest wiring is allowed');