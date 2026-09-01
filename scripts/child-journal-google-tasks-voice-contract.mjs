import assert from 'node:assert/strict';
import fs from 'node:fs';

const tasks=fs.readFileSync('src/google-tasks.ts','utf8');
const domain=fs.readFileSync('src/child-journal-google-tasks.ts','utf8');
const schema=fs.readFileSync('src/child-journal-schema.ts','utf8');
const commandTypes=fs.readFileSync('migrations/0044_google_voice_command_types.sql','utf8');
const bundle=fs.readFileSync('scripts/feature-contract-bundle.mjs','utf8');
const docs=fs.readFileSync('docs/GOOGLE_TASKS_VOICE_BRIDGE_WAVE115.md','utf8');

for(const marker of [
  "kind:'HEIGHT'",
  "kind:'WEIGHT'",
  "kind:'MEMO'",
  'childJournalFoundationReady(env.DB)',
  "subject_kind IN ('BABY','CHILD')",
  'input.occurredOffsetMinutes>1440',
  "value<20||value>250",
  "value<0.2||value>300",
  "text.length>500",
  "detailCode='JOURNAL_HEIGHT'",
  "detailCode='JOURNAL_WEIGHT'",
  "detailCode='JOURNAL_MEMO'",
  "'MEASUREMENT'",
  "'MEMO'",
  'family_log_journal_entries',
  'google_sync_enabled',
  "source:'google_tasks_child_journal'",
  'addWallClockMinutes(createdAt,-input.occurredOffsetMinutes)',
  'utcNow()',
])assert.ok(domain.includes(marker),`Child Journal Google Tasks domain missing: ${marker}`);

assert.ok(schema.includes("const FOUNDATION_TABLES = ['family_log_journal_entries'] as const"),'Google Tasks journal bridge must reuse the staged schema guard');
assert.doesNotMatch(domain,/metadata[^\n]*(valueText|subject|amount)/,'Activity metadata must not persist child names, values, or note text');

for(const marker of [
  "from './child-journal-google-tasks'",
  "type:'CHILD_JOURNAL_RECORD'",
  "body.startsWith('成長日記')",
  "^成長日記 身長",
  "^成長日記 体重",
  "^成長日記 メモ",
  'INVALID_JOURNAL_HEIGHT',
  'INVALID_JOURNAL_WEIGHT',
  'INVALID_JOURNAL_MEMO',
  'UNSUPPORTED_JOURNAL_SUBJECT',
  'UNSUPPORTED_JOURNAL_COMMAND',
  "command.type==='CHILD_JOURNAL_RECORD'",
  'recordExternalChildJournalGoogleTasksDomain',
  "command_type='FAMILY_LOG_RECORD'",
  "target_type='family_log'",
  'CHILD_JOURNAL_DOMAIN_REJECTED',
])assert.ok(tasks.includes(marker),`Google Tasks Child Journal wiring missing: ${marker}`);

assert.ok(tasks.indexOf("body.startsWith('成長日記')")<tasks.indexOf("/^ミルク"),'Explicit Child Journal grammar must run before generic Family Log parsing');
assert.ok(tasks.includes("subject.subjectKind==='PET'"),'Child Journal voice commands must explicitly reject PET subjects');
assert.ok(commandTypes.includes("'FAMILY_LOG_RECORD'"),'Existing receipt enum must retain FAMILY_LOG_RECORD');
assert.ok(!commandTypes.includes("'CHILD_JOURNAL_RECORD'"),'No new D1 command_type enum should be introduced for Child Journal voice');
assert.ok(bundle.includes("['child-journal-google-tasks-voice',['node','scripts/child-journal-google-tasks-voice-contract.mjs']]"),'Google integration bundle must run Child Journal Google Tasks voice contract');
for(const phrase of ['FT 成長日記 身長 82.5','FT 成長日記 体重 10.25','FT 成長日記 メモ 初めて靴を履いた','成長日記と明示','最大24時間前','Google Calendar'])assert.ok(docs.includes(phrase),`Google Tasks voice docs missing Child Journal boundary: ${phrase}`);

console.log('child-journal-google-tasks-voice-contract: bounded explicit journal grammar, canonical journal promotion, existing receipt idempotency, and privacy bounds ok');
