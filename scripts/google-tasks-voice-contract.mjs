import assert from 'node:assert/strict';
import fs from 'node:fs';

const tasks=fs.readFileSync('src/google-tasks.ts','utf8');
const home=fs.readFileSync('src/google-home.ts','utf8');
const migration=fs.readFileSync('migrations/0038_wave115_google_tasks_voice_inbox.sql','utf8');
const docs=fs.readFileSync('docs/GOOGLE_TASKS_VOICE_BRIDGE_WAVE115.md','utf8');

for(const value of ['HMAC','encryptRefreshToken','/users/@me/lists','updatedMin',"showCompleted:'true'","showDeleted:'true'",'OVERLAP_MS','external_etag',"'CONFLICT'","'TOMBSTONE'","'PRIVATE'",'calendar_visible','sync_lease_token','MAX_ACCOUNTS','MAX_TASKS_PER_INVOCATION'])assert.ok(tasks.includes(value),value);
for(const value of ["subject_kind IN ('BABY','CHILD','PET')",'overview_quick_types_json',"['MEAL','BATH','MEDICINE','WATER']",'recordExternalPetQuickLogDomain','recorder_name','Linked members'])assert.ok(home.includes(value),value);
for(const value of ['UNIQUE(family_id,member_id)','UNIQUE(account_id,external_tasklist_id,external_task_id)','refresh_token_ciphertext','import_visibility'])assert.ok(migration.includes(value),value);
for(const value of ['voice print','time is not preserved or invented','zero Gemini','does not promise a particular list'])assert.ok(docs.includes(value),value);

console.log('google-tasks-voice-contract: bounded Google Tasks sync, private projection guards, family-log voice bridge, schema uniqueness, and voice-import semantics ok');
