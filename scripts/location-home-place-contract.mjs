import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0060_location_home_place.sql','utf8');
const api=fs.readFileSync('src/location-home-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const settingsPage=fs.readFileSync('src/settings-location-page.ts','utf8');
const settingsClient=fs.readFileSync('public/assets/settings-location.js','utf8');

for(const marker of [
  'CREATE TABLE IF NOT EXISTS family_location_places',
  "kind TEXT NOT NULL CHECK (kind IN ('HOME'))",
  'latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0)',
  'longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0)',
  'UNIQUE (family_id, kind)',
])assert.ok(migration.includes(marker),`HOME migration boundary missing: ${marker}`);

for(const marker of [
  "role==='OWNER'||role==='ADMIN'",
  "request.headers.get('x-csrf-token')",
  'constantTimeEqual(ctx.session.csrfToken,csrf)',
  "action==='delete'",
  "action!=='capture'",
  'new D1LocationQueryService(ctx.env.DB)',
  'service.latest({scope:{familyId,requesterMemberId},subjectMemberId:sourceMemberId})',
  'MAX_LOCATION_AGE_MS=30*60*1000',
  "WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL LIMIT 1",
  "DELETE FROM family_location_places WHERE family_id=? AND kind='HOME'",
  "ON CONFLICT(family_id,kind) DO UPDATE SET",
  "configured:true",
  "'cache-control':'no-store'",
])assert.ok(api.includes(marker),`HOME API boundary missing: ${marker}`);

assert.ok(routes.includes("import { locationHomeApi } from './location-home-api';")&&routes.includes("if(url.pathname==='/api/location/home') return await locationHomeApi(request,context);"),'HOME API must be authenticated context-routed');
assert.ok(settingsPage.includes('🏠 自宅地点')&&settingsPage.includes('この最新位置を自宅に設定'),'OWNER/ADMIN Location settings must expose explicit HOME capture controls');
assert.ok(settingsPage.includes("const homeCard=isAdmin?"),'HOME management controls must be rendered only to OWNER/ADMIN');
assert.ok(settingsPage.includes('ブラウザの現在地は取得せず、住所や逆ジオコーディングも使用しません。'),'HOME UI must explain provider-minimized capture semantics');
assert.ok(settingsClient.includes("fetch('/api/location/home'"),'settings client must use the authenticated HOME API');
assert.ok(settingsClient.includes("homeApi({action:'capture',sourceMemberId})"),'browser may submit only source member identity for HOME capture');
assert.ok(settingsClient.includes("homeApi({action:'delete'})"),'browser must provide explicit HOME deletion');

for(const source of [api,settingsClient]){
  assert.ok(!source.includes('console.log')&&!source.includes('console.error'),'HOME path must not log location state');
}
assert.doesNotMatch(api,/request\.url|URLSearchParams|searchParams/,'HOME API must not accept coordinates or credentials in URLs');
assert.doesNotMatch(api,/body\.(?:latitude|longitude)|body\[['"](?:latitude|longitude)/,'HOME API must not accept browser-supplied coordinates');
assert.doesNotMatch(settingsClient,/navigator\.geolocation|localStorage|sessionStorage/,'HOME settings must not obtain browser location or persist private location state in browser storage');
assert.doesNotMatch(api,/sourceMemberName:[\s\S]{0,300}(?:latitude|longitude)/,'HOME inventory response must not expose stored HOME coordinates');

console.log('location-home-place-contract: ok');
