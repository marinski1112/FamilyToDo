import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/location-query-service.ts',import.meta.url),'utf8');

assert.match(source,/implements LocationQueryService/,'D1 read layer must implement the retained provider-neutral LocationQueryService');
assert.match(source,/const MAX_HISTORY_LIMIT=500;/,'history must retain a hard browser-safe bound');
assert.match(source,/const MAX_BATCH_SUBJECTS=12;/,'family batch history must retain the family-member cap');
assert.match(source,/JOIN members subject[\s\S]*subject\.family_id=l\.family_id[\s\S]*subject\.active=1/,'latest must require an active subject in the same family');
assert.match(source,/JOIN location_devices device[\s\S]*device\.id=l\.device_id[\s\S]*device\.family_id=l\.family_id[\s\S]*device\.member_id=l\.member_id[\s\S]*device\.enabled=1[\s\S]*device\.sharing_enabled=1[\s\S]*device\.revoked_at IS NULL/,'latest must hide retained coordinates when the source device is disabled, share-off, revoked, or scope-mismatched');
assert.match(source,/WHERE l\.family_id=\? AND l\.member_id=\?/,'latest must scope stored coordinates by family and subject');
assert.match(source,/requester\.id=\? AND requester\.family_id=\? AND requester\.active=1/,'latest/history must prove the requester is an active member of the supplied family');
assert.match(source,/JOIN location_devices device[\s\S]*device\.id=h\.device_id[\s\S]*device\.family_id=h\.family_id[\s\S]*device\.member_id=h\.member_id[\s\S]*device\.enabled=1[\s\S]*device\.sharing_enabled=1[\s\S]*device\.revoked_at IS NULL/,'history must hide retained points when their source device is disabled, share-off, revoked, or scope-mismatched');
assert.match(source,/WHERE h\.family_id=\? AND h\.member_id=\?/,'history must scope raw points by family and subject');
assert.match(source,/h\.recorded_at>=\? AND h\.recorded_at<=\?/,'history must use an explicit time window');
assert.match(source,/ORDER BY h\.recorded_at DESC,h\.id DESC[\s\S]*LIMIT \?/,'history must select only the newest bounded points in the interval');
assert.match(source,/ORDER BY recorded_at ASC,id ASC/,'bounded history must be returned chronologically for map rendering');
assert.match(source,/if\(!canonicalIso\(query\.from\)\|\|!canonicalIso\(query\.to\)\|\|query\.from>query\.to\)return \[\];/,'invalid or reversed history windows must fail closed');

assert.match(source,/async historyForSubjects\(/,'family-wide summaries require one batched history reader');
assert.match(source,/subjectMemberIds\.length===0\|\|subjectMemberIds\.length>MAX_BATCH_SUBJECTS/,'batch history must fail closed outside its explicit subject cap');
assert.match(source,/ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY h\.member_id[\s\S]*ORDER BY h\.recorded_at DESC,h\.id DESC/,'batch history must rank newest points independently per member');
assert.match(source,/WHERE h\.family_id=\? AND h\.member_id IN \(\$\{placeholders\}\)/,'batch history must keep one family scope and bind every requested member id');
assert.match(source,/WHERE member_rank<=\?/,'batch history must retain the per-member point cap');
assert.match(source,/ORDER BY member_id ASC,recorded_at ASC,id ASC/,'batch history must restore chronological order independently per member');
const batchStart=source.indexOf('async historyForSubjects');
const batchBlock=batchStart>=0?source.slice(batchStart):'';
assert.match(batchBlock,/JOIN members subject[\s\S]*subject\.id=h\.member_id[\s\S]*subject\.family_id=h\.family_id[\s\S]*subject\.active=1/,'batch history must require active same-family subjects');
assert.match(batchBlock,/JOIN location_devices device[\s\S]*device\.id=h\.device_id[\s\S]*device\.family_id=h\.family_id[\s\S]*device\.member_id=h\.member_id[\s\S]*device\.enabled=1[\s\S]*device\.sharing_enabled=1[\s\S]*device\.revoked_at IS NULL/,'batch history must preserve device sharing/revocation boundaries');
assert.match(batchBlock,/requester\.id=\? AND requester\.family_id=\? AND requester\.active=1/,'batch history must prove the active same-family requester');

assert.doesNotMatch(source,/SELECT \*/,'Location reads must project only fields required by the provider-neutral point contract');
assert.doesNotMatch(source,/secret_hash|authorization|raw_payload|console\.(?:log|info|warn|error)/i,'Location query layer must not touch credentials, raw provider payloads, or logs');

console.log('location-query-service-contract: single-subject and bounded batched family history privacy/order/cap boundaries ok');
