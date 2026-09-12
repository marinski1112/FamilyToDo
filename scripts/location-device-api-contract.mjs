import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../src/location-device-api.ts',import.meta.url),'utf8');
const routes=await readFile(new URL('../src/context-api-routes.ts',import.meta.url),'utf8');
const publicRoutes=await readFile(new URL('../src/public-routes.ts',import.meta.url),'utf8');
const ownTracks=await readFile(new URL('../src/location-owntracks-ingress.ts',import.meta.url),'utf8');
const overland=await readFile(new URL('../src/location-overland-ingress.ts',import.meta.url),'utf8');
const overlandNormalizer=await readFile(new URL('../src/location-overland.ts',import.meta.url),'utf8');
const settings=await readFile(new URL('../src/settings-location-page.ts',import.meta.url),'utf8');

assert.match(routes,/import \{ locationDeviceApi \} from '\.\/location-device-api';/,'context router must retain Location device API import');
assert.match(routes,/url\.pathname==='\/api\/location\/devices'[\s\S]{0,80}locationDeviceApi\(request,context\)/,'device management must use authenticated context routing');
assert.match(api,/if\(!member\)return fail\(401,'AUTH_REQUIRED'/,'device management must require an authenticated member');
assert.match(api,/body\.csrf!==ctx\.session\.csrfToken/,'all device mutations must be CSRF protected');
assert.match(api,/provisionLocationDevice\(ctx\.env\.DB/,'provision action must reuse the retained one-time credential service');
assert.match(api,/WHERE id=\? AND family_id=\?/,'existing-device lookup must be family scoped');
assert.match(api,/targetMemberId!==actorMemberId&&!isAdminRole\(member\.role\)/,'device mutation must be limited to self or same-family OWNER\/ADMIN');
assert.match(api,/SET sharing_enabled=\?,updated_at=CURRENT_TIMESTAMP[\s\S]*enabled=1 AND revoked_at IS NULL/,'share toggle must fail closed for disabled or revoked devices');
assert.match(api,/SET sharing_enabled=0,enabled=0,revoked_at=COALESCE\(revoked_at,CURRENT_TIMESTAMP\)/,'revoke must disable sharing and the credential permanently');
assert.match(api,/'cache-control':'no-store'/,'credential and device-management responses must be non-cacheable');
assert.doesNotMatch(api,/SELECT[^;]*secret_hash/is,'management API must never read credential hashes for browser responses');
assert.doesNotMatch(api,/console\.(?:log|info|warn|error)/,'management API must not log device credentials or state');
assert.doesNotMatch(api,/GOOGLE_MAPS_ROUTES_API_KEY/,'management API must not expose the Worker-only Routes key');

assert.match(publicRoutes,/\/api\/location\/overland'[\s\S]{0,80}overlandLocationIngress\(request,env,ctx\)/,'Overland receiver must be a public device-authenticated route');
assert.match(overland,/Authorization[\s\S]*publicId:secret|publicId:secret[\s\S]*Authorization/,'Overland credential must stay in the Authorization header, not the URL');
assert.match(overland,/verifyLocationDeviceCredential\(env\.DB,credential\.publicId,credential\.secret\)/,'Overland must reuse hashed FamilyToDo device credential verification');
assert.match(overland,/device\.provider!=='OWNTRACKS'/,'Overland must currently reuse only the existing iPhone credential class');
assert.match(overland,/persistAuthenticatedLocationPoint\(env\.DB,device,point\)/,'Overland must reuse canonical D1 persistence');
assert.match(overland,/return json\(\{result:'ok',ok:true,accepted:accepted\.length\}\);/,'Overland success must include the canonical result=ok acknowledgement so the app clears its local queue');
assert.doesNotMatch(overland,/searchParams|console\.(?:log|info|warn|error)|raw_payload/i,'Overland ingress must not accept URL tokens or log raw location data');
assert.match(overlandNormalizer,/payload\.locations\.length>MAX_OVERLAND_LOCATIONS/,'Overland batches must be bounded');
assert.match(overlandNormalizer,/geometry\.coordinates/,'Overland GeoJSON coordinates must be normalized');
assert.match(overlandNormalizer,/properties\.timestamp/,'Overland must preserve the sensor timestamp');
assert.match(overlandNormalizer,/const speed=nonNegative\(feature\.properties\.speed\)/,'negative unavailable speed sentinels must be omitted instead of rejecting the GPS point');
assert.match(overlandNormalizer,/const course=heading\(feature\.properties\.course\)/,'unavailable or invalid course metadata must be omitted instead of rejecting the GPS point');
assert.match(overlandNormalizer,/const accuracy=nonNegative\(feature\.properties\.horizontal_accuracy\)/,'unavailable negative accuracy metadata must be omitted instead of rejecting the GPS point');
assert.doesNotMatch(overlandNormalizer,/speed!==undefined&&speed<0|course!==undefined&&\(course<0|accuracy!==undefined&&accuracy<0/,'optional negative sensor sentinels must not reject a valid location point');
assert.match(overlandNormalizer,/provider:'OWNTRACKS'/,'Overland points must match the shared credential provider until a schema migration explicitly introduces another provider');
assert.match(settings,/id="overlandUrl"/,'Location settings must expose the Overland endpoint');
assert.match(settings,/id="overlandToken"/,'Location settings must expose the one-time Overland bearer token');

assert.match(ownTracks,/if\(ownTracksType\(payload\)==='waypoint'\)return json\(\[\]\);/,'authenticated OwnTracks waypoint metadata must be acknowledged as a 2xx no-op');
const waypointIndex=ownTracks.indexOf("ownTracksType(payload)==='waypoint'");
const verifyIndex=ownTracks.indexOf('verifyLocationDeviceCredential');
assert.ok(verifyIndex>=0&&waypointIndex>verifyIndex,'waypoint no-op must occur only after credential verification');

console.log('location-device-api-contract: management, Overland auth/sentinel/ack persistence, and authenticated OwnTracks waypoint no-op boundaries ok');
