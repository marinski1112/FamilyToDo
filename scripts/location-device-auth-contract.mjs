import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/location-device-auth.ts',import.meta.url),'utf8');
const migration=await readFile(new URL('../migrations/0052_location_persistence_foundation.sql',import.meta.url),'utf8');

assert.match(source,/crypto\.subtle\.digest\('SHA-256'/,'device secrets must use SHA-256 before comparison/storage');
assert.match(source,/constantTimeHexEqual/,'device secret verification must use a constant-time comparison helper');
assert.match(source,/JOIN members m[\s\S]*m\.id=d\.member_id[\s\S]*m\.family_id=d\.family_id[\s\S]*m\.active=1/,'device auth must bind the member to the same active family');
assert.match(source,/d\.enabled=1/,'disabled devices must fail closed');
assert.match(source,/d\.sharing_enabled=1/,'share-off devices must fail closed');
assert.match(source,/d\.revoked_at IS NULL/,'revoked devices must fail closed');
assert.match(source,/storedPublicId!==normalizedPublicId/,'returned credential identity must remain bound to the queried public ID');
assert.match(source,/isLocationProvider\(provider\)/,'unknown providers must fail closed');
assert.doesNotMatch(source,/console\.(?:log|info|warn|error)/,'device auth must not log secrets or credential material');
assert.doesNotMatch(source,/Authorization|request\.url|searchParams|query token/i,'device auth must not accept credentials from URL/query/Authorization plumbing');

assert.match(migration,/secret_hash TEXT NOT NULL/,'persistence foundation must store only a device secret hash');
assert.doesNotMatch(migration,/^\s*(?:secret|token|authorization|raw_payload)\s+TEXT\b/im,'migration must not add plaintext credential or raw-payload columns');
assert.match(migration,/sharing_enabled INTEGER NOT NULL DEFAULT 0/,'new devices must remain share-off by default');

console.log('location-device-auth-contract: ok');
