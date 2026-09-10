import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/location-latest-api.ts',import.meta.url),'utf8');
const history=await readFile(new URL('../src/location-history-api.ts',import.meta.url),'utf8');
const routes=await readFile(new URL('../src/context-api-routes.ts',import.meta.url),'utf8');

assert.match(source,/new D1LocationQueryService\(ctx\.env\.DB\)/,'latest API must reuse the provider-neutral LocationQueryService');
assert.match(source,/if\(!requester\)return fail\(401,'AUTH_REQUIRED'/,'latest API must require an authenticated member');
assert.match(source,/request\.method!=='GET'/,'latest projection must be read-only');
assert.match(source,/WHERE m\.family_id=\? AND m\.active=1/,'member presentation rows must be limited to active members in the authenticated family');
assert.match(source,/d\.family_id=m\.family_id[\s\S]*d\.member_id=m\.id[\s\S]*d\.enabled=1[\s\S]*d\.sharing_enabled=1[\s\S]*d\.revoked_at IS NULL/,'sharing state must fail closed for disabled, share-off, revoked or mismatched devices');
assert.match(source,/scope:\{familyId,requesterMemberId\}[\s\S]*subjectMemberId/,'coordinate reads must preserve requester/family/subject scope through LocationQueryService');
assert.match(source,/state:'SHARING_OFF'/);assert.match(source,/state:'NO_LOCATION'/);
assert.match(source,/if\(ageMinutes<=5\)return \{state:'FRESH'/);assert.match(source,/if\(ageMinutes<=30\)return \{state:'AGING'/);assert.match(source,/return \{state:'STALE'/);
assert.match(source,/function straightLineDistanceMeters\(from:CoordinatePoint,to:CoordinatePoint\):number\|null/);
assert.match(source,/earthRadiusMeters=6371000/);
assert.match(source,/Math\.sin\(latitudeDelta\/2\)\*\*2[\s\S]*Math\.cos\(fromLatitude\)\*Math\.cos\(toLatitude\)[\s\S]*Math\.sin\(longitudeDelta\/2\)\*\*2/);
assert.match(source,/requesterPoint=requesterSharingEnabled\?await service\.latest\([\s\S]*subjectMemberId:requesterMemberId/);
assert.match(source,/subjectMemberId!==requesterMemberId&&requesterPoint&&point[\s\S]*straightLineDistanceMeters\(requesterPoint,point\)/);
assert.match(source,/distanceMetersFromViewer,/);
assert.match(source,/latest:point\?\{[\s\S]*latitude:point\.latitude[\s\S]*longitude:point\.longitude[\s\S]*recordedAt:point\.recordedAt/);
assert.match(source,/'cache-control':'no-store'/);
assert.doesNotMatch(source,/SELECT \*/);
assert.doesNotMatch(source,/secret_hash|public_id|device_id|raw_payload|authorization|console\.(?:log|info|warn|error)/i);
assert.doesNotMatch(source,/navigator\.geolocation|GOOGLE_MAPS_|Routes API/i);
assert.match(routes,/import \{ locationLatestApi \} from '\.\/location-latest-api';/);
assert.match(routes,/url\.pathname==='\/api\/location\/latest'\) return await locationLatestApi\(request,context\)/);

assert.match(history,/const HISTORY_LIMIT=500;/);
assert.match(history,/const MAX_HISTORY_WINDOW_MS=31\*24\*60\*60\*1000;/);
assert.match(history,/if\(!requester\)return fail\(401,'AUTH_REQUIRED'/);
assert.match(history,/request\.method!=='GET'/);
assert.match(history,/new D1LocationQueryService\(ctx\.env\.DB\)/,'raw/live history must retain provider-neutral query service');
assert.match(history,/service\.history\(\{[\s\S]*scope:\{familyId,requesterMemberId\}[\s\S]*subjectMemberId[\s\S]*from[\s\S]*to[\s\S]*limit:HISTORY_LIMIT/);
assert.match(history,/points:points\.map\([^\n]*point[\s\S]*latitude:point\.latitude[\s\S]*longitude:point\.longitude[\s\S]*recordedAt:point\.recordedAt/,'history responses must expose only map-required point fields');
assert.match(history,/readArchivedDay[\s\S]*location_history_archive_days/,'durable archived days may be read directly');
assert.match(history,/location_devices d[\s\S]*d\.enabled=1[\s\S]*d\.sharing_enabled=1[\s\S]*d\.revoked_at IS NULL/,'archived Location reads must preserve current sharing/revoke gate');
assert.match(history,/'cache-control':'no-store'/);
assert.doesNotMatch(history,/secret_hash|public_id|raw_payload|authorization|console\.(?:log|info|warn|error)/i,'history boundary must not expose/log credentials or provider payloads');
assert.doesNotMatch(history,/\bprovider\s*[:=]/i,'history HTTP boundary must not project provider identifiers');
assert.match(routes,/import \{ locationHistoryApi[^}]*\} from '\.\/location-history-api';/);
assert.match(routes,/url\.pathname==='\/api\/location\/history'\) return await locationHistoryApi\(request,context\)/);

console.log('location-latest-api-contract: latest + bounded live/archive history ok');
