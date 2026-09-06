import './location-route-eta-contract.mjs';
import './location-home-place-contract.mjs';
import fs from 'node:fs';

const domain=fs.readFileSync('src/location-domain.ts','utf8');
const providers=fs.readFileSync('src/location-providers.ts','utf8');
const page=fs.readFileSync('src/location-page.ts','utf8');
const client=fs.readFileSync('public/assets/location.js','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const workerConfig=fs.readFileSync('worker-configuration.d.ts','utf8');
const checklist=fs.readFileSync('src/task-events-page.ts','utf8');

if(page.includes("from './app'"))throw new Error('Location page must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { LOCATION_PRIVACY_DEFAULTS, LOCATION_ROADMAP } from './location-domain';",
  "const phase1Ready=new Set(['owntracks','latest','history','places','distance']);",
  "export async function locationPage(_request:Request,ctx:AppContext,env:Env):Promise<Response>{",
  "const mapsKey=esc(env.GOOGLE_MAPS_BROWSER_KEY||'');",
  "const mapsMapId=esc(env.GOOGLE_MAPS_MAP_ID||'');",
  "const csrf=esc(ctx.session.csrfToken||'');",
  "return html(layout('家族の場所',body,'/app/location.php'));",
  'data-location-live',
  'data-location-map',
  'data-location-map-state',
  'data-google-maps-key="${mapsKey}"',
  'data-google-maps-map-id="${mapsMapId}"',
  'data-location-csrf="${csrf}"',
  'data-location-list',
  'data-location-refresh',
  'data-location-home-eta',
  'data-location-home-eta-result',
  'aria-label="家族の最新位置を更新"',
  'この画面は端末の現在地を自動取得しません。',
  '位置が古い場合は「現在地」と断定せず',
  '「車で何分？」または「家まで何分？」を押した時だけRoutes APIへ問い合わせます。',
  '位置共有の既定値: ${privacy.sharingEnabled?\'ON\':\'OFF\'}',
  '登録した端末も最初は共有OFFです。',
  'OWNER / ADMIN が「管理 → 位置情報・OwnTracks」で',
  '自宅地点も明示的な管理操作でのみ設定され',
])if(!page.includes(marker))throw new Error(`Location page boundary marker missing: ${marker}`);

for(const marker of [
  "fetch('/api/location/latest'",
  "credentials:'same-origin'",
  "cache:'no-store'",
  "FRESH:'最新'",
  "AGING:'少し前'",
  "STALE:'古い位置'",
  "NO_LOCATION:'位置情報なし'",
  "SHARING_OFF:'共有OFF'",
  'location-member-row',
  'textContent=name',
  'replaceChildren()',
  '精度 ±${Math.round(accuracy)}m',
  'const lastUpdatedText=(recordedAt)=>{',
  "new Intl.DateTimeFormat('ja-JP'",
  'const distanceText=(meters)=>{',
  'const googleMapsUrl=(latest)=>{',
  'https://www.google.com/maps/search/?api=1&query=',
  "const mapsKey=String(root.getAttribute('data-google-maps-key')||'').trim();",
  "const mapsMapId=String(root.getAttribute('data-google-maps-map-id')||'').trim();",
  "const csrf=String(root.getAttribute('data-location-csrf')||'').trim();",
  'https://maps.googleapis.com/maps/api/js?',
  "if(!mapsKey)return Promise.reject(new Error('MAPS_NOT_CONFIGURED'));",
  "const located=members.filter((member)=>member?.latest&&member?.sharingEnabled&&validPoint(member.latest));",
  'new maps.LatLngBounds()',
  'new maps.Map(mapEl',
  'maps.marker?.AdvancedMarkerElement',
  "etaButton.textContent='車で何分？';",
  "fetch('/api/location/eta'",
  "method:'POST'",
  "'x-csrf-token':csrf",
  'body:JSON.stringify(body)',
  "etaRequest({targetMemberId})",
  "etaRequest({destinationKind:'HOME'})",
  "const canRoute=!member.isViewer&&(member.state==='FRESH'||member.state==='AGING')",
  "if(homeEtaEl)homeEtaEl.addEventListener('click',()=>void requestHomeEta());",
  "if(refreshEl)refreshEl.addEventListener('click',()=>void load());",
])if(!client.includes(marker))throw new Error(`Location client/map/ETA marker missing: ${marker}`);
for(const forbidden of [
  'navigator.geolocation',
  'setInterval(',
  'console.log',
  'console.error',
  'Authorization',
  'deviceId',
  'publicDeviceId',
  'rawPayload',
  'GOOGLE_MAPS_ROUTES_API_KEY',
  'GOOGLE_MAPS_ROUTE_API_KEY',
])if(client.includes(forbidden))throw new Error(`Location client must not use sensitive behavior: ${forbidden}`);

for(const marker of [
  'sharingEnabled:false',
  'ingestEnabled:false',
  'persistLatest:false',
  'persistHistory:false',
  "key:'owntracks'",
  "key:'latest'",
  "key:'history'",
  "key:'places'",
  "key:'distance'",
])if(!domain.includes(marker))throw new Error(`Location privacy/domain default missing: ${marker}`);

for(const marker of [
  'export type LocationScope=',
  'familyId:number;',
  'requesterMemberId:number;',
  'export type LocationPoint=',
  'export interface LocationQueryService{',
  'latest(query:LatestLocationQuery):Promise<LocationPoint|null>;',
  'history(query:LocationHistoryQuery):Promise<readonly LocationPoint[]>;',
  'export interface MapProvider{',
  'export interface RouteProvider{',
  'export interface VoiceProvider{',
])if(!providers.includes(marker))throw new Error(`Location provider boundary marker missing: ${marker}`);

for(const forbidden of ['ctx.env.DB','DB.prepare','navigator.geolocation','fetch(','/api/location']){
  if(page.includes(forbidden)||domain.includes(forbidden)||providers.includes(forbidden))throw new Error(`Location page/domain/provider-neutral boundaries must not directly perform Location persistence or ingress: ${forbidden}`);
}
for(const providerSpecific of ['googleapis.com','maps.googleapis.com','owntracks','LINE_ACCESS_TOKEN','GOOGLE_']){
  if(providers.toLowerCase().includes(providerSpecific.toLowerCase()))throw new Error(`Location provider-neutral boundary must not embed a provider implementation: ${providerSpecific}`);
}
if(!workerConfig.includes('GOOGLE_MAPS_BROWSER_KEY?:string;')||!workerConfig.includes('GOOGLE_MAPS_MAP_ID?:string;'))throw new Error('Google Maps browser settings must remain optional typed environment fields');
if(!routes.includes("import { locationPage } from './location-page';"))throw new Error('Location page import missing');
if(!routes.includes("if(url.pathname==='/app/location.php') return await locationPage(request,context,env);"))throw new Error('Location page route must pass environment config');
if(!routes.includes("if(url.pathname==='/app/shopping.php') return await shopping(request,context);"))throw new Error('Shopping compatibility/management route must remain');
if(!shell.includes("['/app/location.php','📍','位置情報']"))throw new Error('Location must occupy the former Shopping bottom-navigation slot');
if(!shell.includes("const LOCATION_UI_REVISION = 'home-eta1';"))throw new Error('Location cache revision missing');
if(!shell.includes("active==='/app/location.php'?`<script defer src=\"/assets/location.js?v=${APP_VERSION}-${LOCATION_UI_REVISION}\"></script>`:''"))throw new Error('Location client asset must load only on Location page');
if(shell.includes("['/app/shopping.php','🛒','買い物']"))throw new Error('Shopping must not remain in bottom navigation');
if(!checklist.includes('href="/app/shopping.php">一覧・管理</a>'))throw new Error('Checklist must retain a direct Shopping management link');

console.log('location-page-boundary: authenticated family map plus explicit member/HOME ETA actions remain no-geolocation/no-auto-polling and keep provider secrets server-side');
