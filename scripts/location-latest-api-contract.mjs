import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/location-latest-api.ts',import.meta.url),'utf8');
const routes=await readFile(new URL('../src/context-api-routes.ts',import.meta.url),'utf8');

assert.match(source,/new D1LocationQueryService\(ctx\.env\.DB\)/,'latest API must reuse the provider-neutral LocationQueryService');
assert.match(source,/if\(!requester\)return fail\(401,'AUTH_REQUIRED'/,'latest API must require an authenticated member');
assert.match(source,/request\.method!=='GET'/,'latest projection must be read-only');
assert.match(source,/WHERE m\.family_id=\? AND m\.active=1/,'member presentation rows must be limited to active members in the authenticated family');
assert.match(source,/d\.family_id=m\.family_id[\s\S]*d\.member_id=m\.id[\s\S]*d\.enabled=1[\s\S]*d\.sharing_enabled=1[\s\S]*d\.revoked_at IS NULL/,'sharing state must fail closed for disabled, share-off, revoked or mismatched devices');
assert.match(source,/scope:\{familyId,requesterMemberId\}[\s\S]*subjectMemberId/,'coordinate reads must preserve requester/family/subject scope through LocationQueryService');
assert.match(source,/state:'SHARING_OFF'/,'projection must distinguish sharing-off members without exposing retained coordinates');
assert.match(source,/state:'NO_LOCATION'/,'projection must distinguish sharing-on members with no usable latest point');
assert.match(source,/if\(ageMinutes<=5\)return \{state:'FRESH'/,'0–5 minute points must be classified fresh');
assert.match(source,/if\(ageMinutes<=30\)return \{state:'AGING'/,'5–30 minute points must expose their age state');
assert.match(source,/return \{state:'STALE'/,'30+ minute points must be explicitly stale');
assert.match(source,/latest:point\?\{[\s\S]*latitude:point\.latitude[\s\S]*longitude:point\.longitude[\s\S]*recordedAt:point\.recordedAt/,'projection must expose only map-required point fields');
assert.match(source,/'cache-control':'no-store'/,'location coordinates must not be stored in shared HTTP caches');
assert.doesNotMatch(source,/SELECT \*/,'latest API must project only required member/device state');
assert.doesNotMatch(source,/secret_hash|public_id|device_id|raw_payload|authorization|console\.(?:log|info|warn|error)/i,'latest API must not expose or log device credentials, identifiers, raw provider payloads, or authorization data');
assert.doesNotMatch(source,/navigator\.geolocation|GOOGLE_MAPS_|Routes API/i,'Phase 2A projection must not invent browser geolocation or unconfigured Maps/Routes bindings');
assert.match(routes,/import \{ locationLatestApi \} from '\.\/location-latest-api';/,'context API dispatcher must retain the latest-location boundary');
assert.match(routes,/url\.pathname==='\/api\/location\/latest'\) return await locationLatestApi\(request,context\)/,'authenticated context routing must expose the latest projection endpoint');

console.log('location-latest-api-contract: ok');
