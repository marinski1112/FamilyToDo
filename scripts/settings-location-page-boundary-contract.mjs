import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page=await readFile(new URL('../src/settings-location-page.ts',import.meta.url),'utf8');
const pageRoutes=await readFile(new URL('../src/page-routes.ts',import.meta.url),'utf8');
const handlers=await readFile(new URL('../src/settings-page-handlers.ts',import.meta.url),'utf8');
const settingsJs=await readFile(new URL('../public/assets/settings.js',import.meta.url),'utf8');
const locationJs=await readFile(new URL('../public/assets/settings-location.js',import.meta.url),'utf8');
const api=await readFile(new URL('../src/location-device-api.ts',import.meta.url),'utf8');
const homeApi=await readFile(new URL('../src/location-home-api.ts',import.meta.url),'utf8');

assert.match(handlers,/settingsLocation.*settings-location-page/,'settings handler barrel must export the OwnTracks management page');
assert.match(pageRoutes,/\/app\/settings_location\.php[\s\S]{0,100}settingsLocation\(request,context\)/,'page router must retain the authenticated OwnTracks settings route');
assert.match(settingsJs,/\/app\/settings_location\.php/,'main management page must link to OwnTracks device settings');
assert.match(page,/OwnTracks端末を発行/,'settings page must provide an explicit OwnTracks provisioning action');
assert.match(page,/この接続情報は今だけ表示されます/,'settings page must warn that the plaintext secret is one-time');
assert.match(page,/端末は最初は共有OFF/,'new location devices must be visibly documented as sharing-off by default');
assert.match(page,/settingsLocationPayload/,'page must provide a bounded CSRF payload to its dedicated asset');
assert.match(page,/commitSession\(html\(/,'page must persist a newly-created CSRF token before device mutation');
assert.match(locationJs,/fetch\('\/api\/location\/devices',[\s\S]*method:'POST'/,'device mutations must use the existing authenticated management API');
assert.match(locationJs,/action:'provision',provider:'OWNTRACKS'/,'provisioning UI must explicitly request the OwnTracks provider');
assert.match(locationJs,/action:'sharing'/,'settings UI must expose location-sharing control');
assert.match(locationJs,/action:'revoke'/,'settings UI must expose permanent credential revocation');
assert.match(locationJs,/location\.origin.*\/api\/location\/owntracks/,'OwnTracks HTTP endpoint must be same-origin and must not embed credentials');
assert.doesNotMatch(locationJs,/localStorage|sessionStorage/,'one-time device secrets must not be persisted in browser storage');
assert.doesNotMatch(locationJs,/secret=.*(?:URLSearchParams|searchParams)|[?&](?:secret|token)=/,'device credentials must never be placed in query strings');
assert.match(api,/if\(request\.method==='GET'\)/,'device API must expose a safe authenticated inventory read');
assert.match(api,/WHERE d\.family_id=\?\$\{admin\?'':' AND d\.member_id=\?'\}/,'device inventory must be family-scoped and self-scoped for non-admin members');
assert.doesNotMatch(api,/SELECT[^;]*secret_hash/is,'browser device inventory must never read or expose stored secret hashes');

assert.match(page,/const homeCard=isAdmin\?/,'HOME controls must only render for OWNER/ADMIN');
assert.match(page,/id="homeSourceMember"/,'HOME capture must select from authenticated family member options');
assert.match(page,/id="captureHomePlace"/,'HOME capture must require an explicit admin action');
assert.match(page,/id="deleteHomePlace"/,'HOME deletion must be explicit');
assert.match(locationJs,/fetch\('\/api\/location\/home'/,'HOME controls must use the authenticated HOME endpoint');
assert.match(locationJs,/homeApi\(\{action:'capture',sourceMemberId\}\)/,'HOME capture browser payload must contain only the selected source member identity');
assert.match(locationJs,/homeApi\(\{action:'delete'\}\)/,'HOME deletion must be explicit');
assert.match(homeApi,/isAdminRole\(requester\.role\)/,'HOME mutation/read surface must independently enforce admin role server-side');
assert.doesNotMatch(page,/navigator\.geolocation/,'settings page must not ask browser for current location');
assert.doesNotMatch(locationJs,/navigator\.geolocation/,'settings client must not ask browser for current location');

console.log('settings-location-page-boundary-contract: OwnTracks device controls and admin-only HOME capture remain explicit, CSRF-protected and free of browser geolocation/credential persistence');
