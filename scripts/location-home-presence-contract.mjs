import fs from 'node:fs';

const api=fs.readFileSync('src/location-latest-api.ts','utf8');
const client=fs.readFileSync('public/assets/location.js','utf8');

for(const marker of [
  "type HomePresence='HOME'|'AWAY'|'UNKNOWN'|'NO_HOME';",
  "type HomePresenceReason='HOME_CONFIRMED'|'AWAY_CONFIRMED'|'HOME_NOT_CONFIGURED'|'SHARING_OFF'|'NO_LOCATION'|'STALE_LOCATION'|'LOCATION_ACCURACY_MISSING'|'HOME_ACCURACY_MISSING'|'INVALID_DISTANCE'|'ACCURACY_OVERLAP';",
  'const HOME_RADIUS_METERS=150;',
  "WHERE family_id=? AND kind='HOME'",
  "if(state==='SHARING_OFF')return {status:'UNKNOWN',reason:'SHARING_OFF'};",
  "if(!point||state==='NO_LOCATION')return {status:'UNKNOWN',reason:'NO_LOCATION'};",
  "if(state==='STALE')return {status:'UNKNOWN',reason:'STALE_LOCATION'};",
  "if(pointAccuracy===undefined||!Number.isFinite(pointAccuracy))return {status:'UNKNOWN',reason:'LOCATION_ACCURACY_MISSING'};",
  "if(homeAccuracy===undefined||!Number.isFinite(homeAccuracy))return {status:'UNKNOWN',reason:'HOME_ACCURACY_MISSING'};",
  'const uncertainty=Math.max(0,pointAccuracy)+Math.max(0,homeAccuracy);',
  "if(distance+uncertainty<=HOME_RADIUS_METERS)return {status:'HOME',reason:'HOME_CONFIRMED'};",
  "if(distance-uncertainty>HOME_RADIUS_METERS)return {status:'AWAY',reason:'AWAY_CONFIRMED'};",
  "return {status:'UNKNOWN',reason:'ACCURACY_OVERLAP'};",
  'homePresence:presence.status,',
  'homePresenceReason:presence.reason,',
  'homeConfigured:Boolean(home)',
])if(!api.includes(marker))throw new Error(`HOME presence API boundary missing: ${marker}`);

for(const forbidden of [
  'GoogleRoutesProvider',
  'GOOGLE_MAPS_ROUTES_API_KEY',
  'GOOGLE_MAPS_ROUTE_API_KEY',
  'navigator.geolocation',
  'activity_logs',
  'family_log',
  'INSERT INTO',
  'UPDATE ',
])if(api.includes(forbidden))throw new Error(`HOME presence projection must remain read-only/provider-neutral: ${forbidden}`);

for(const marker of [
  "HOME:'🏠 自宅内'",
  "AWAY:'外出中'",
  "UNKNOWN:'自宅判定保留'",
  "STALE_LOCATION:'最終位置が30分以上前です'",
  "LOCATION_ACCURACY_MISSING:'現在地の精度情報がありません'",
  "HOME_ACCURACY_MISSING:'自宅地点の精度情報がありません'",
  "ACCURACY_OVERLAP:'GPS誤差が自宅判定の境界と重なっています'",
  'const presence=homePresenceLabel(member);',
  "const atHome=members.filter((member)=>member?.homePresence==='HOME').length;",
  "const presenceUnknown=members.filter((member)=>member?.homePresence==='UNKNOWN').length;",
  '位置の古さとは別に、Google Maps表示には管理側のブラウザ用Mapsキー設定が必要です。',
])if(!client.includes(marker))throw new Error(`HOME presence client marker missing: ${marker}`);

console.log('location-home-presence: HOME/AWAY stays deterministic and accuracy-aware; UNKNOWN now exposes a privacy-safe reason including stale stationary locations');
