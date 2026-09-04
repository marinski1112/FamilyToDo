import fs from 'node:fs';

const domain=fs.readFileSync('src/location-domain.ts','utf8');
const providers=fs.readFileSync('src/location-providers.ts','utf8');
const page=fs.readFileSync('src/location-page.ts','utf8');
const client=fs.readFileSync('public/assets/location.js','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const checklist=fs.readFileSync('src/task-events-page.ts','utf8');

if(page.includes("from './app'"))throw new Error('Location page must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { LOCATION_PRIVACY_DEFAULTS, LOCATION_ROADMAP } from './location-domain';",
  "const phase1Ready=new Set(['owntracks','latest','history']);",
  "export async function locationPage(_request:Request,ctx:AppContext):Promise<Response>{",
  "return html(layout('家族の場所',body,'/app/location.php'));",
  'data-location-live',
  'data-location-map-state',
  'data-location-list',
  'この画面は端末の現在地を自動取得しません。',
  '位置が古い場合は「現在地」と断定せず',
  '位置共有の既定値: ${privacy.sharingEnabled?\'ON\':\'OFF\'}',
  '登録した端末も最初は共有OFFです。',
  '共有ONの登録端末から認証済みの位置情報が届いた場合にだけ',
  '共有OFFまたは失効済みの端末は位置送信・参照の対象外になります。',
])if(!page.includes(marker))throw new Error(`Location page boundary marker missing: ${marker}`);

for(const stale of [
  'この初期画面では端末位置を取得せず、FamilyToDo側にも最新位置・履歴を保存しません。',
  '次段階で OwnTracks ingress、端末ごとのsecret、latest/history/place/distance を個別に設計',
])if(page.includes(stale))throw new Error(`Location page must not describe implemented Phase 1 foundations as future work: ${stale}`);

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
])if(!client.includes(marker))throw new Error(`Location client fallback marker missing: ${marker}`);
for(const forbidden of [
  'navigator.geolocation',
  'console.log',
  'console.error',
  'Authorization',
  'secret',
  'deviceId',
  'publicDeviceId',
  'rawPayload',
  'maps.googleapis.com',
  'GOOGLE_MAPS_',
])if(client.includes(forbidden))throw new Error(`Location client must not use sensitive/provider-specific behavior: ${forbidden}`);

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
if(!routes.includes("import { locationPage } from './location-page';"))throw new Error('Location page import missing');
if(!routes.includes("if(url.pathname==='/app/location.php') return await locationPage(request,context);"))throw new Error('Location page route missing');
if(!routes.includes("if(url.pathname==='/app/shopping.php') return await shopping(request,context);"))throw new Error('Shopping compatibility/management route must remain');
if(!shell.includes("['/app/location.php','📍','位置情報']"))throw new Error('Location must occupy the former Shopping bottom-navigation slot');
if(!shell.includes("active==='/app/location.php'?`<script defer src=\"/assets/location.js?v=${APP_VERSION}\"></script>`:''"))throw new Error('Location client asset must load only on Location page');
if(shell.includes("['/app/shopping.php','🛒','買い物']"))throw new Error('Shopping must not remain in bottom navigation');
if(!checklist.includes('href="/app/shopping.php">一覧・管理</a>'))throw new Error('Checklist must retain a direct Shopping management link');

console.log('location-page-boundary: Phase 2B latest projection shell/list fallback, no browser geolocation/provider credentials, provider-neutral service boundaries ok');
