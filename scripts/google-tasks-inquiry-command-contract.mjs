import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/google-tasks-inquiry-command.ts','utf8');

for(const token of [
  'parseMarkedGoogleVoiceInquiryCommand',
  'executeMarkedGoogleVoiceInquiry',
  'GoogleVoiceInquiryLineResolver',
  "command_type='INQUIRY'",
  'target_type=NULL',
  'target_id=NULL',
  "status<>'EXECUTED'",
  "'PUSH_NOT_CONFIGURED'",
  "'NO_PUSH_SUBSCRIPTION'",
  "'PUSH_DELIVERY_FAILED'",
  "'INQUIRY_RUNTIME_ERROR'",
  'account_id=? AND external_tasklist_id=? AND external_task_id=?',
]) assert.ok(source.includes(token),`Google Tasks inquiry command adapter missing ${token}`);

assert.match(source,/existing && \(String\(existing\.status\) === 'EXECUTED' \|\| String\(existing\.external_etag \|\| ''\) === String\(item\.etag \|\| ''\)\)/,'adapter must preserve existing exactly-once / same-etag suppression');
assert.match(source,/validateAccount\(account\);/,'adapter must validate account tenant/member keys before ledger writes');
assert.ok(!/FROM\s+tasks\b|FROM\s+recurrence_rules\b|FROM\s+recurrence_occurrences\b|FROM\s+shopping_items\b/i.test(source),'adapter must not duplicate canonical task/recurrence/shopping domain reads');
assert.ok(!/console\.|cookie|authorization|refresh_token|member_name|description|location|latitude|longitude|gps/i.test(source),'adapter must not log or handle unrelated sensitive/location data');

console.log('google-tasks-inquiry-command-contract: typed inquiry parsing, member-scoped runtime reuse, exactly-once ledger semantics, nullable target, and injected canonical domain resolution remain enforced');
