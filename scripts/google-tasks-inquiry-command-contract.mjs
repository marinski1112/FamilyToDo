import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/google-tasks-inquiry-command.ts','utf8');
const delivery=fs.readFileSync('src/google-voice-inquiry-delivery.ts','utf8');

for(const token of [
  'parseMarkedGoogleVoiceInquiryCommand',
  'executeMarkedGoogleVoiceInquiry',
  'GoogleVoiceInquiryLineResolver',
  'GoogleVoiceInquiryDeliveryError',
  "command_type='INQUIRY'",
  'target_type=NULL',
  'target_id=NULL',
  "status<>'EXECUTED'",
  "'PUSH_NOT_CONFIGURED'",
  "'NO_PUSH_SUBSCRIPTION'",
  "'PUSH_DELIVERY_FAILED'",
  "'INQUIRY_PRE_DELIVERY_ERROR'",
  "'INQUIRY_AMBIGUOUS_RUNTIME_ERROR'",
  'account_id=? AND external_tasklist_id=? AND external_task_id=?',
]) assert.ok(source.includes(token),`Google Tasks inquiry command adapter missing ${token}`);

assert.match(source,/existing && String\(existing\.status\) === 'EXECUTED'/,'adapter must preserve exactly-once suppression after a successful execution');
assert.match(source,/!canRetryUnchangedInquiry\(existing, item\)/,'adapter must suppress unchanged outcome-ambiguous inquiry failures');
assert.match(source,/RETRYABLE_INQUIRY_ERRORS[\s\S]*PUSH_NOT_CONFIGURED[\s\S]*NO_PUSH_SUBSCRIPTION[\s\S]*PUSH_DELIVERY_FAILED[\s\S]*INQUIRY_PRE_DELIVERY_ERROR/,'only failures known safe to retry may redeliver an unchanged inquiry');
assert.match(source,/String\(existing\.external_etag \|\| ''\) !== String\(item\.etag \|\| ''\)/,'an external task etag change must permit a fresh attempt');
assert.match(source,/error instanceof GoogleVoiceInquiryDeliveryError && error\.phase === 'PRE_DELIVERY'/,'adapter must distinguish known pre-delivery failures from ambiguous transport/runtime failures');
assert.match(delivery,/new GoogleVoiceInquiryDeliveryError\('PRE_DELIVERY'\)/,'resolver/payload failures must be classified before transport starts');
assert.match(delivery,/new GoogleVoiceInquiryDeliveryError\('AMBIGUOUS_DELIVERY'\)/,'transport exceptions must be treated as outcome-ambiguous');
const pushCall=delivery.indexOf('return await sendMemberWebPush(');
assert.ok(pushCall >= 0,'delivery adapter must use the existing member-scoped Web Push transport');
assert.ok(delivery.indexOf("GoogleVoiceInquiryDeliveryError('PRE_DELIVERY')") < pushCall,'pre-delivery classification must occur before Web Push transport');
assert.ok(delivery.indexOf("GoogleVoiceInquiryDeliveryError('AMBIGUOUS_DELIVERY')") > pushCall,'ambiguous classification must cover transport/post-send failures');
assert.match(source,/validateAccount\(account\);/,'adapter must validate account tenant/member keys before ledger writes');
assert.ok(!/FROM\s+tasks\b|FROM\s+recurrence_rules\b|FROM\s+recurrence_occurrences\b|FROM\s+shopping_items\b/i.test(source),'adapter must not duplicate canonical task/recurrence/shopping domain reads');
assert.ok(!/console\.|cookie|authorization|refresh_token|member_name|description|location|latitude|longitude|gps/i.test(source),'adapter must not log or handle unrelated sensitive/location data');
assert.ok(!/console\.|cookie|authorization|refresh_token|member_name|description|location|latitude|longitude|gps/i.test(delivery),'delivery adapter must not log or handle unrelated sensitive/location data');

console.log('google-tasks-inquiry-command-contract: typed inquiry parsing, member-scoped runtime reuse, safe retry classification, ambiguous outcome suppression, successful exactly-once suppression, nullable target, and injected canonical domain resolution remain enforced');
