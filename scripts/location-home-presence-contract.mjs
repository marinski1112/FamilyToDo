import fs from 'node:fs';

const api=fs.readFileSync('src/location-latest-api.ts','utf8');
const client=fs.readFileSync('public/assets/location.js','utf8');

for(const marker of [
  "type HomePresence='HOME'|'AWAY'|'UNKNOWN'|'NO_HOME';",
  'const HOME_RADIUS_METERS=150;',
  "WHERE family_id=? AND kind='HOME'",
  "if(!point||(state!=='FRESH'&&state!=='AGING'))return 'UNKNOWN';",
  "if(pointAccuracy===undefined||homeAccuracy===undefined||!Number.isFinite(pointAccuracy)||!Number.isFinite(homeAccuracy))return 'UNKNOWN';",
  'const uncertainty=Math.max(0,pointAccuracy)+Math.max(0,homeAccuracy);',
  "if(distance+uncertainty<=HOME_RADIUS_METERS)return 'HOME';",
  "if(distance-uncertainty>HOME_RADIUS_METERS)return 'AWAY';",
  'homePresence:homePresence(point,safeFreshness.state,home),',
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
  "const atHome=members.filter((member)=>member?.homePresence==='HOME').length;",
  "const presenceUnknown=members.filter((member)=>member?.homePresence==='UNKNOWN').length;",
  '位置の古さとは別に、Google Maps表示には管理側のブラウザ用Mapsキー設定が必要です。',
])if(!client.includes(marker))throw new Error(`HOME presence client marker missing: ${marker}`);

console.log('location-home-presence: HOME/AWAY is deterministic and accuracy-aware; stale, missing and uncertain locations remain UNKNOWN without persistence or paid routing');
