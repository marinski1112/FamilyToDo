import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../src/location-device-api.ts',import.meta.url),'utf8');
const routes=await readFile(new URL('../src/context-api-routes.ts',import.meta.url),'utf8');

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

console.log('location-device-api-contract: ok');
