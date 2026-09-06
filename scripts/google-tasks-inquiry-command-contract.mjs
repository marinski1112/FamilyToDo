import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/google-tasks-inquiry-command.ts','utf8');
const delivery=fs.readFileSync('src/google-voice-inquiry-delivery.ts','utf8');
const movement=fs.readFileSync('src/google-voice-movement-inquiry.ts','utf8');
const movementSummary=fs.readFileSync('src/location-day-summary.ts','utf8');
const queryService=fs.readFileSync('src/location-query-service.ts','utf8');
const tasksSync=fs.readFileSync('src/google-tasks.ts','utf8');

for(const token of [
  'extractMarkedGoogleVoiceInquiryBody',
  'executeMarkedGoogleVoiceInquiry',
  'executeGoogleVoiceYesterdayMovementInquiry',
  'GoogleVoiceInquiryLineResolver',
  'GoogleVoiceInquiryDeliveryError',
  'assertAccountTenantIntegrity',
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

assert.match(source,/extractMarkedGoogleVoiceInquiryBody\(item\.title\) === null/,'only explicitly marked commands may enter the inquiry runtime/fallback envelope');
assert.match(source,/existing && String\(existing\.status\) === 'EXECUTED'/,'adapter must preserve exactly-once suppression after a successful execution');
assert.match(source,/!canRetryUnchangedInquiry\(existing, item\)/,'adapter must suppress unchanged outcome-ambiguous inquiry failures');
const retryBlock=/const RETRYABLE_INQUIRY_ERRORS = new Set\(\[([\s\S]*?)\]\);/.exec(source)?.[1] || '';
for(const code of ['PUSH_NOT_CONFIGURED','NO_PUSH_SUBSCRIPTION','INQUIRY_PRE_DELIVERY_ERROR']){
  assert.ok(retryBlock.includes(`'${code}'`),`${code} must remain retryable because delivery is known not to have started`);
}
assert.ok(!retryBlock.includes("'PUSH_DELIVERY_FAILED'"),'generic push delivery failure is outcome-ambiguous and must not retry unchanged');
assert.ok(!retryBlock.includes("'INQUIRY_AMBIGUOUS_RUNTIME_ERROR'"),'ambiguous runtime failure must not retry unchanged');
assert.match(source,/String\(existing\.external_etag \|\| ''\) !== String\(item\.etag \|\| ''\)/,'an external task etag change must permit a fresh attempt');
assert.match(source,/error instanceof GoogleVoiceInquiryDeliveryError && error\.phase === 'PRE_DELIVERY'/,'adapter must distinguish known pre-delivery failures from ambiguous transport/runtime failures');
assert.match(delivery,/new GoogleVoiceInquiryDeliveryError\('PRE_DELIVERY'\)/,'resolver/payload failures must be classified before transport starts');
assert.match(delivery,/new GoogleVoiceInquiryDeliveryError\('AMBIGUOUS_DELIVERY'\)/,'transport exceptions must be treated as outcome-ambiguous');
const pushCall=delivery.indexOf('return await sendMemberWebPush(');
assert.ok(pushCall >= 0,'delivery adapter must use the existing member-scoped Web Push transport');
assert.ok(delivery.indexOf("GoogleVoiceInquiryDeliveryError('PRE_DELIVERY')") < pushCall,'pre-delivery classification must occur before Web Push transport');
assert.ok(delivery.indexOf("GoogleVoiceInquiryDeliveryError('AMBIGUOUS_DELIVERY')") > pushCall,'ambiguous classification must cover transport/post-send failures');
assert.match(source,/validateAccount\(account\);/,'adapter must validate account tenant/member keys before ledger writes');
assert.match(source,/FROM external_google_task_accounts a[\s\S]*?JOIN members m ON m\.id=a\.member_id AND m\.family_id=a\.family_id[\s\S]*?a\.id=\? AND a\.family_id=\? AND a\.member_id=\? AND a\.tasklist_id=\?[\s\S]*?a\.status IN \('ACTIVE','SYNCING'\)[\s\S]*?m\.active=1 AND m\.deleted_at IS NULL/,'adapter must revalidate the persisted active account, tenant, member and tasklist before processing');
const tenantCheck=source.indexOf('await assertAccountTenantIntegrity(env, account);');
const ledgerRead=source.indexOf('SELECT id,external_etag,status,error_code');
const movementCall=source.indexOf('const movement = await executeGoogleVoiceYesterdayMovementInquiry(');
const runtimeCall=source.indexOf('const result = await executeMarkedGoogleVoiceInquiry(');
assert.ok(tenantCheck >= 0 && ledgerRead > tenantCheck && movementCall > ledgerRead && runtimeCall > movementCall,'tenant/ledger checks must precede deterministic movement and generic inquiry delivery');
assert.ok(!/FROM\s+tasks\b|FROM\s+recurrence_rules\b|FROM\s+recurrence_occurrences\b|FROM\s+shopping_items\b/i.test(source),'adapter must not duplicate canonical task/recurrence/shopping domain reads');
assert.ok(!/console\.|cookie|authorization|refresh_token|member_name|description|location|latitude|longitude|gps/i.test(source),'adapter must not log or handle unrelated sensitive/location data');
assert.ok(!/console\.|cookie|authorization|refresh_token|member_name|description|location|latitude|longitude|gps/i.test(delivery),'delivery adapter must not log or handle unrelated sensitive/location data');

for(const phrase of ['昨日の移動','昨日の移動は','昨日の移動を教えて','昨日の移動を教えてください'])assert.ok(movement.includes(phrase),`movement inquiry missing exact phrase ${phrase}`);
assert.match(movement,/extractMarkedGoogleVoiceInquiryBody\(value\)/,'movement inquiry must reuse the bounded explicit FamilyToDo marker parser');
assert.match(movement,/EXACT_YESTERDAY_MOVEMENT\.has\(body\)/,'movement inquiry must remain deterministic exact-match only');
assert.match(movement,/buildLocationMovementDayLines\(/,'movement inquiry must reuse the provider-neutral coarse movement projection');
assert.match(movement,/member\.family_id!==familyId/,'movement inquiry must revalidate member/family scope before location reads');
assert.match(movement,/sendMemberWebPush\(env,familyId,memberId,payload\)/,'movement result must use member-scoped Web Push delivery');
assert.match(movement,/url:'\/app\/location\.php'/,'movement push must link only to the authenticated Location page');
assert.ok(!/classifyMarkedGoogleVoiceInquiryWithGemini|geminiFetch|familyAiProvider/.test(movement),'privacy-sensitive movement inquiry must not use Gemini classification');
assert.ok(!/console\.|latitude|longitude|device_id|provider_payload|owntracks|authorization|api[_-]?key/i.test(movement),'movement inquiry must not log or expose raw location/provider credentials');

assert.match(movementSummary,/export async function buildLocationMovementDayLines/,'strict one-day provider-neutral movement projection is required');
assert.match(movementSummary,/historyForSubjects\(\{[\s\S]*scope:\{familyId,requesterMemberId\}[\s\S]*subjectMemberIds:members\.map\(member=>member\.id\)[\s\S]*limitPerSubject:HISTORY_LIMIT/,'movement projection must use one bounded batched family history read with requester scope');
assert.doesNotMatch(movementSummary,/for\s*\([^)]*member[^)]*\)[\s\S]{0,300}service\.history\(/,'movement projection must not issue one D1 history statement per member');
assert.match(queryService,/ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY h\.member_id/,'batch history must preserve a separate newest-point cap per member');
assert.match(queryService,/WHERE member_rank<=\?/,'batch history must enforce the per-member history limit');
assert.match(queryService,/device\.enabled=1[\s\S]*device\.sharing_enabled=1[\s\S]*device\.revoked_at IS NULL/,'batch history must preserve enabled/share-on/non-revoked device filtering');
assert.match(queryService,/requester\.id=\? AND requester\.family_id=\? AND requester\.active=1/,'batch history must preserve active same-family requester proof');
assert.match(movementSummary,/centerDistance-accuracyRadiusMeters\(previous\)-accuracyRadiusMeters\(current\)/,'movement distance must preserve GPS-accuracy uncertainty subtraction');
assert.match(tasksSync,/export const MAX_D1_QUERY_BUDGET=40;/,'Google Tasks sync must retain its explicit D1 query budget');
assert.match(tasksSync,/export const MAX_TASKS_PER_INVOCATION=3;/,'Google Tasks sync page cap must remain explicit');

console.log('google-tasks-inquiry-command-contract: exactly-once movement inquiry uses one bounded family history statement per requested day, preserving tenant/privacy boundaries and the Google Tasks D1 query budget');
