import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/location-quality-diagnostics-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

assert.ok(routes.includes("'/api/location/quality-diagnostics'"),'quality diagnostics route must be wired');
assert.ok(routes.includes("from './location-quality-diagnostics-api'"),'quality diagnostics handler must be imported');
assert.match(api,/role==='OWNER'\|\|role==='ADMIN'/,'diagnostics must be admin-only');
assert.match(api,/WHERE h\.family_id=\?/,'history query must be family-scoped');
assert.match(api,/d\.provider='OWNTRACKS'/,'diagnostics must stay on the OwnTracks source lane');
assert.match(api,/d\.enabled=1/);
assert.match(api,/d\.sharing_enabled=1/);
assert.match(api,/d\.revoked_at IS NULL/);
assert.match(api,/LIMIT \$\{MAX_POINTS\}/,'diagnostic history must be bounded');
assert.match(api,/const MAX_POINTS=40/);
assert.match(api,/accuracyMeters/);
assert.match(api,/receivedDelaySeconds/);
assert.match(api,/intervalSecondsToOlder/);
assert.match(api,/accuracyTrendVsOlder/);
assert.match(api,/isCurrentLatest/);
assert.match(api,/latestSelection:'NEWEST_SENSOR_TIME',qualityAware:false/,'diagnostics must report the actual current latest policy');
assert.match(api,/'cache-control':'no-store'/);

const sql=api.match(/const result=await ctx\.env\.DB\.prepare\(`([\s\S]*?)`\)/)?.[1]||'';
assert.ok(sql,'diagnostic SQL must remain discoverable');
assert.doesNotMatch(sql,/\blatitude\b|\blongitude\b/i,'diagnostic query must never select coordinates');
assert.doesNotMatch(api,/\bINSERT\s+INTO\b|\bUPDATE\s+(?:member_location|location_devices)\b|\bDELETE\s+FROM\b/i,'diagnostic endpoint must remain read-only');
assert.ok(api.includes('Deliberately selects no coordinates'),'privacy boundary must remain documented');
console.log('location-quality-diagnostics-contract: bounded privacy-safe OwnTracks quality diagnosis ok');
