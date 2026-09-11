import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0080_family_daily_journal_ai.sql','utf8');
const ai=fs.readFileSync('src/family-daily-journal-ai.ts','utf8');
const page=fs.readFileSync('src/family-daily-journal-ai-page.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');

for(const marker of ['ai_summary_text','ai_model','ai_status','ai_generated_at','ai_source_content_version','ai_location_member_ids_json'])assert.ok(migration.includes(marker),`missing journal AI column: ${marker}`);
assert.ok(ai.includes('MAX_AI_GENERATIONS_PER_RUN=3'),'scheduled AI work must be globally bounded');
assert.ok(ai.includes('AI_RETRY_HOURS=6'),'failed AI generations need a cooldown');
assert.ok(ai.includes('FAMILY_JOURNAL_GEMINI_MODEL'),'journal must use its feature-specific model policy');
assert.ok(ai.includes('geminiFetch(env,FAMILY_JOURNAL_GEMINI_MODEL'),'journal Gemini call must use the 3.7 model policy');
assert.ok(ai.includes("ai_source_content_version<>content_version"),'journal AI must refresh only after deterministic evidence changes');
assert.ok(ai.includes('parseLocationMemberIds(row.location_json)'),'AI narrative must retain the Location member provenance needed for revocation');
assert.ok(ai.includes("ai_status='AI_OK'"),'successful AI generation must be classified');
assert.ok(!ai.includes('console.log'),'journal AI must not log prompts, responses or private journal text');
assert.ok(page.includes('required.some(id=>!shared.has(id))'),'AI narrative must fail closed after Location sharing stops');
assert.ok(page.includes('familyDailyJournalPage(request,ctx)'),'AI page must layer on the existing deterministic/privacy-filtered journal');
assert.ok(page.includes('✨ AI日誌'),'journal detail must visibly distinguish AI narrative from deterministic evidence');
assert.ok(routes.includes('familyDailyJournalPageWithAi'),'Family Journal route must use the privacy-gated AI page');
assert.ok(index.includes('generateFamilyDailyJournals(env)).then(()=>generateFamilyDailyJournalAi(env))'),'AI generation must run only after deterministic journal refresh');
assert.ok(!ai.includes('latitude')&&!ai.includes('longitude'),'journal AI must not introduce raw-coordinate fields');

console.log('Family daily journal AI contract OK');
