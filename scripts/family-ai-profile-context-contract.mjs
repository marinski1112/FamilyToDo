import fs from 'node:fs';

const helper=fs.readFileSync('src/family-ai-profile-context.ts','utf8');
const familyAi=fs.readFileSync('src/family-ai.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  'export async function loadSafeFamilyAiProfileContext',
  'WHERE family_id=? AND active=1 AND ai_personalization_enabled=1',
  'SELECT id,name,subject_kind,personality_note',
  'MAX_PERSONALITY_CONTEXT_CHARS=320',
  'subject_ref:`S${id}`',
  'export function deriveBirthFactsForExplicitPermission',
  'birth_month_day',
  "zodiac",
])if(!helper.includes(marker))throw new Error(`AI profile safe projection marker missing: ${marker}`);

const select=/SELECT id,name,subject_kind,personality_note[\s\S]*?FROM family_log_subjects/.exec(helper)?.[0]||'';
for(const forbidden of ['birth_date','sex_gender','birthplace','blood_type']){
  if(select.includes(forbidden))throw new Error(`current AI profile query must not select ${forbidden} before field-level permission exists`);
}
if(/personality_note\s*:\s*row\.personality_note/.test(helper))throw new Error('personality memo must pass through the bounded clamp before projection');
if(!helper.includes("Array.from(String(value??'').trim()).slice(0,max).join('')"))throw new Error('Unicode-safe context clamp missing');

for(const source of [familyAi,digest]){
  if(source.includes("from './family-ai-profile-context'"))throw new Error('profile projection must remain unwired from Gemini/digest in this bounded scope');
}

if(helper.includes('generateContent')||helper.includes('GEMINI_API_KEY')||helper.includes('geminiFetch('))throw new Error('profile projection helper must not call Gemini');

console.log('family-ai-profile-context-contract: global opt-in, family scope, least-data projection, bounded memo and no Gemini wiring ok');
