import assert from 'node:assert/strict';
import fs from 'node:fs';

const tasks=fs.readFileSync('src/google-tasks.ts','utf8');
const home=fs.readFileSync('src/google-home.ts','utf8');
const webpush=fs.readFileSync('src/webpush.ts','utf8');
const migration=fs.readFileSync('migrations/0038_wave115_google_tasks_voice_inbox.sql','utf8');
const commandTypes=fs.readFileSync('migrations/0044_google_voice_command_types.sql','utf8');
const shoppingAddIdempotency=fs.readFileSync('migrations/0046_google_voice_shopping_add_idempotency.sql','utf8');
const docs=fs.readFileSync('docs/GOOGLE_TASKS_VOICE_BRIDGE_WAVE115.md','utf8');

for(const value of ['HMAC','encryptRefreshToken','/users/@me/lists','updatedMin',"showCompleted:'true'","showDeleted:'true'",'OVERLAP_MS','external_etag',"'CONFLICT'","'TOMBSTONE'","'PRIVATE'",'calendar_visible','sync_lease_token','MAX_ACCOUNTS','MAX_TASKS_PER_INVOCATION'])assert.ok(tasks.includes(value),value);
for(const value of ["type:'TASK_CREATE'","command.type==='TASK_CREATE'","command_type='TASK_CREATE'","target_type='task'",'MISSING_TASK_TITLE',"INSERT OR IGNORE INTO task_assignees(task_id,member_id)"])assert.ok(tasks.includes(value),value);
for(const value of ["type:'TASK_COMPLETE'","command.type==='TASK_COMPLETE'","command_type='TASK_COMPLETE'",'AMBIGUOUS_TASK','TASK_NOT_FOUND_OR_NOT_ASSIGNED',"INSERT INTO task_completions(task_id,member_id,completed_at)","INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)","target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')", "COALESCE(t.visibility_scope,'FAMILY')='FAMILY'",'ta.member_id=? LIMIT 2'])assert.ok(tasks.includes(value),value);
for(const value of ["type:'SHOPPING_COMPLETE'","command.type==='SHOPPING_COMPLETE'","command_type='SHOPPING_COMPLETE'",'MISSING_SHOPPING_COMPLETE_NAME','AMBIGUOUS_SHOPPING','SHOPPING_NOT_FOUND_OR_NOT_ASSIGNED',"INSERT INTO shopping_completions(shopping_item_id,member_id,completed_at)","INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at)","target_type='shopping'", "COALESCE(t.visibility_scope,'FAMILY')='FAMILY'",'sa.member_id=? LIMIT 2'])assert.ok(tasks.includes(value),value);
for(const value of ['CREATE TRIGGER IF NOT EXISTS trg_google_voice_shopping_add_existing_command',"NEW.command_type = 'SHOPPING_ADD'","existing.status <> 'EXECUTED'","command_type = 'SHOPPING_ADD'","target_type = 'shopping'","status = 'EXECUTED'",'error_code = NULL','SELECT RAISE(IGNORE)'])assert.ok(shoppingAddIdempotency.includes(value),value);
assert.ok(shoppingAddIdempotency.indexOf('UPDATE external_google_voice_commands')<shoppingAddIdempotency.indexOf('SELECT RAISE(IGNORE)'),'existing voice command must be promoted before duplicate insert is ignored');
for(const value of ["subject_kind IN ('BABY','CHILD','PET')",'overview_quick_types_json',"['MEAL','BATH','MEDICINE','WATER']",'recordExternalPetQuickLogDomain','recorder_name','Linked members'])assert.ok(home.includes(value),value);
for(const value of ['UNIQUE(family_id,member_id)','UNIQUE(account_id,external_tasklist_id,external_task_id)','refresh_token_ciphertext','import_visibility'])assert.ok(migration.includes(value),value);
for(const value of ["'INQUIRY'","target_type TEXT CHECK(target_type IN ('shopping','family_log','task'))"])assert.ok(commandTypes.includes(value),value);
for(const value of ['export async function sendMemberWebPush','member_id=? AND family_id=? AND enabled=1','LIMIT ?','Math.min(10','DELETE FROM web_push_subscriptions WHERE id=? AND member_id=? AND family_id=?','failure_count=failure_count+1','last_success_at=?','function nowUtcSql()',"toISOString().slice(0,19).replace('T',' ')"])assert.ok(webpush.includes(value),value);
assert.ok(!webpush.includes('WHERE family_id=? AND enabled=1 ORDER BY id DESC LIMIT ?'),'member push helper must never fan out across a whole family');
assert.ok(!webpush.includes("timeZone:'Asia/Tokyo'"),'Web Push transport metadata must not use family-local/JST wall clock');
assert.ok(!webpush.includes('nowJstSql'),'legacy JST transport timestamp helper must stay removed');
for(const value of ['voice print','time is not preserved or invented','zero Gemini','does not promise a particular list'])assert.ok(docs.includes(value),value);

console.log('google-tasks-voice-contract: bounded Google Tasks sync, private projection guards, typed task/shopping creation and completion, corrected SHOPPING_ADD idempotency, family-log voice bridge, inquiry-safe member Web Push foundation with UTC transport metadata, schema uniqueness, and voice-import semantics ok');
