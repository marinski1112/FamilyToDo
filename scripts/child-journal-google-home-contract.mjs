import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('src/google-home.ts','utf8');
const domain=fs.readFileSync('src/child-journal-google-home.ts','utf8');
const schema=fs.readFileSync('src/child-journal-schema.ts','utf8');
const bundle=fs.readFileSync('scripts/feature-contract-bundle.mjs','utf8');
const docs=fs.readFileSync('docs/GOOGLE_HOME_VOICE_SETUP.md','utf8');

for(const marker of [
  "export type ChildJournalVoiceMilestone = 'STAND'|'FIRST_STEP'|'FIRST_TOOTH'|'TOOTH'",
  "STAND:'立った'",
  "FIRST_STEP:'歩いた'",
  "FIRST_TOOTH:'最初の歯'",
  "TOOTH:'歯'",
  "stand:'STAND'",
  "first_step:'FIRST_STEP'",
  "first_tooth:'FIRST_TOOTH'",
  "tooth:'TOOTH'",
  'childJournalFoundationReady(env.DB)',
  "subject_kind IN ('BABY','CHILD')",
  "`JOURNAL_${code}`",
  "'MEMO'",
  "'MILESTONE'",
  "google_sync_enabled",
  "source:'google_home_child_journal'",
])assert.ok(domain.includes(marker),`Child Journal Google Home domain missing: ${marker}`);

assert.ok(schema.includes("const FOUNDATION_TABLES = ['family_log_journal_entries'] as const"),'Voice journal must reuse the staged-schema guard');
assert.doesNotMatch(domain,/HEIGHT|WEIGHT|amount=.*voice|request\.json|free.?text/i,'Fixed Scene milestone domain must not accept numeric/free-form payloads');
assert.doesNotMatch(domain,/subject_name|note:/,'Activity metadata must not copy subject names or journal note content');

for(const marker of [
  "from './child-journal-google-home'",
  "['stand','STAND','立った記録'",
  "['first_step','FIRST_STEP','歩いた記録'",
  "['first_tooth','FIRST_TOOTH','最初の歯記録'",
  "['tooth','TOOTH','歯記録'",
  'ft:journal:${slug}:${s.id}',
  "category:'成長日記'",
  'recordExternalChildJournalMilestoneDomain',
  "const journal=/^ft:journal:(stand|first_step|first_tooth|tooth):(\\d+)$/",
  "['睡眠','排泄','成長日記','家族ログ','ペット','ちょこっと家事']",
])assert.ok(home.includes(marker),`Google Home Child Journal wiring missing: ${marker}`);

assert.ok(home.includes('childJournalGoogleHomeReady(env)'),'Scene SYNC must hide Child Journal milestones until migration 0048 is ready');
assert.ok(home.includes("external_command_receipts"),'Child Journal scenes must remain under canonical Google Home idempotency receipts');
assert.ok(home.includes("subject_kind IN ('BABY','CHILD','PET')"),'Scene catalog must retain explicit subject-kind boundary');
assert.ok(bundle.includes("['child-journal-google-home',['node','scripts/child-journal-google-home-contract.mjs']]"),'Google integration bundle must run the Child Journal voice contract');
for(const phrase of ['成長日記','立った','歩いた','最初の歯','身長・体重'])assert.ok(docs.includes(phrase),`Google Home docs missing Child Journal capability boundary: ${phrase}`);

console.log('child-journal-google-home-contract: fixed milestone Scenes, tenant/schema guards, idempotency, and capability bounds ok');
