import fs from 'node:fs';

const domain=fs.readFileSync('src/location-domain.ts','utf8');
const page=fs.readFileSync('src/location-page.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const checklist=fs.readFileSync('src/task-events-page.ts','utf8');

if(page.includes("from './app'"))throw new Error('Location page must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { LOCATION_PRIVACY_DEFAULTS, LOCATION_ROADMAP } from './location-domain';",
  "export async function locationPage(_request:Request,ctx:AppContext):Promise<Response>{",
  "return html(layout('位置情報',body,'/app/location.php'));",
  '位置共有: ${privacy.sharingEnabled?\'ON\':\'OFF\'}',
  '位置情報は送信・保存しません',
])if(!page.includes(marker))throw new Error(`Location page boundary marker missing: ${marker}`);

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

for(const forbidden of ['ctx.env.DB','DB.prepare','navigator.geolocation','fetch(','/api/location']){
  if(page.includes(forbidden)||domain.includes(forbidden))throw new Error(`Location shell must not activate persistence/ingress yet: ${forbidden}`);
}
if(!routes.includes("import { locationPage } from './location-page';"))throw new Error('Location page import missing');
if(!routes.includes("if(url.pathname==='/app/location.php') return await locationPage(request,context);"))throw new Error('Location page route missing');
if(!routes.includes("if(url.pathname==='/app/shopping.php') return await shopping(request,context);"))throw new Error('Shopping compatibility/management route must remain');
if(!shell.includes("['/app/location.php','📍','位置情報']"))throw new Error('Location must occupy the former Shopping bottom-navigation slot');
if(shell.includes("['/app/shopping.php','🛒','買い物']"))throw new Error('Shopping must not remain in bottom navigation');
if(!checklist.includes('href="/app/shopping.php">一覧・管理</a>'))throw new Error('Checklist must retain a direct Shopping management link');

console.log('location-page-boundary: privacy-first shell, retained Shopping management route and Location navigation ok');
