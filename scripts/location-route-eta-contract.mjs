import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/location-route-api.ts','utf8');
const provider=fs.readFileSync('src/location-google-routes.ts','utf8');
const latest=fs.readFileSync('src/location-latest-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const worker=fs.readFileSync('worker-configuration.d.ts','utf8');

for(const marker of [
  "request.method!=='POST'",
  "request.headers.get('x-csrf-token')",
  'constantTimeEqual(ctx.session.csrfToken,csrf)',
  'targetMemberId===requesterMemberId',
  "WHERE id=? AND family_id=? AND active=1 LIMIT 1",
  'new D1LocationQueryService(ctx.env.DB)',
  'service.latest({scope,subjectMemberId:requesterMemberId})',
  'service.latest({scope,subjectMemberId:targetMemberId})',
  'MAX_LOCATION_AGE_MS=30*60*1000',
  'GOOGLE_MAPS_ROUTES_API_KEY||ctx.env.GOOGLE_MAPS_ROUTE_API_KEY',
  "mode:'drive'",
  "'cache-control':'no-store'",
])assert.ok(api.includes(marker),`ETA API boundary missing: ${marker}`);

for(const marker of [
  "https://routes.googleapis.com/directions/v2:computeRoutes",
  "'x-goog-api-key':this.apiKey",
  "'x-goog-fieldmask':FIELD_MASK",
  "FIELD_MASK='routes.duration,routes.distanceMeters'",
  "travelMode:'DRIVE'",
  'computeAlternativeRoutes:false',
  'setTimeout(()=>controller.abort(),4500)',
  'body:JSON.stringify({',
])assert.ok(provider.includes(marker),`Routes provider boundary missing: ${marker}`);

assert.ok(latest.includes('memberId:subjectMemberId')&&latest.includes('isViewer:subjectMemberId===requesterMemberId'),'browser projection must expose only scoped member identity needed for explicit ETA actions');
assert.ok(routes.includes("import { locationRouteEtaApi } from './location-route-api';")&&routes.includes("if(url.pathname==='/api/location/eta') return await locationRouteEtaApi(request,context);"),'authenticated ETA route must be wired');
assert.ok(worker.includes('GOOGLE_MAPS_ROUTES_API_KEY?:string;')&&worker.includes('GOOGLE_MAPS_ROUTE_API_KEY?:string;'),'expected Routes secret naming variants must be typed');

for(const source of [api,provider]){
  assert.ok(!source.includes('console.log')&&!source.includes('console.error'),'route path must not log coordinates or provider failures');
}
assert.ok(!api.includes('request.url')&&!api.includes('URLSearchParams'),'ETA API must not accept coordinates or secret material via URL');
assert.ok(!provider.includes('?key=')&&!provider.includes('Authorization'),'Routes key must be sent only in the dedicated provider header');

console.log('location-route-eta-contract: ok');
