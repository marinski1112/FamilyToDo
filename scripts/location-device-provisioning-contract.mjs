import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/location-device-provisioning.ts',import.meta.url),'utf8');

assert.match(source,/crypto\.getRandomValues\(bytes\)/,'device secret must use cryptographically secure random bytes');
assert.match(source,/crypto\.randomUUID\(\)/,'public device ID must be generated server-side');
assert.match(source,/hashLocationDeviceSecret\(secret\)/,'plaintext secret must be hashed before persistence');
assert.match(source,/INSERT INTO location_devices[\s\S]*secret_hash[\s\S]*VALUES\(\?,\?,\?,\?,\?,1,0,\?/,'new devices must persist only the hash and remain share-off');
assert.match(source,/createdByMemberId===memberId\|\|creatorRole==='OWNER'\|\|creatorRole==='ADMIN'/,'provisioning must be limited to self or family administrators');
const tenantGuards=source.match(/WHERE id=\? AND family_id=\? AND active=1 AND deleted_at IS NULL/g)??[];
assert.equal(tenantGuards.length,2,'creator and target must both be active members in the same family');
assert.match(source,/sharingEnabled:false/,'provisioning response must make share-off state explicit');
assert.doesNotMatch(source,/console\.(?:log|info|warn|error)/,'provisioning must not log credential material');
assert.doesNotMatch(source,/INSERT INTO location_devices\([\s\S]{0,300}?\bsecret\s*[,)]/i,'plaintext secret must never be a persisted location_devices column');

await import('./location-device-api-contract.mjs');

console.log('location-device-provisioning-contract: ok');
