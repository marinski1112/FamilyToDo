import fs from 'node:fs';

const asset=fs.readFileSync('public/assets/family-log-baby-food-media.js','utf8');
const loader=fs.readFileSync('public/assets/family-log.js','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

const photoLoad=loader.indexOf("family-log-baby-food-media.js?v=baby-food-photo1");
const coreLoad=loader.indexOf("family-log-core.js?v=wave128-fix19");
const checks=[
  [photoLoad>=0&&coreLoad>photoLoad,'photo enhancer must load before Family Log core'],
  [asset.includes('accept="image/*"')&&asset.includes('capture="environment"'),'mobile photo/camera picker is missing'],
  [asset.includes('MAX_EDGE=1600')&&asset.includes("'image/jpeg',quality")&&asset.includes('ctx.drawImage'),'client-side resize/JPEG re-encode boundary is missing'],
  [asset.includes('TARGET_BYTES=3600*1024')&&asset.includes('blob.size>4*1024*1024'),'client output must remain below the 4 MB server limit'],
  [asset.includes('EXIFメタデータは引き継ぎません'),'photo UI must explain local re-encode metadata stripping'],
  [asset.includes("fetch('/api/family-log'")&&asset.includes("action:'save'")&&asset.includes('await uploadPhoto(id,pendingBlob)'),'photo flow must save the canonical Family Log row before media upload'],
  [asset.includes("fetch('/api/family-log-media'")&&asset.includes("'x-csrf-token':csrf")&&asset.includes("'x-family-log-id':String(id)"),'private media upload must preserve CSRF and parent-log headers'],
  [asset.includes("method:'DELETE'")&&asset.includes('/api/family-log-media?media='),'existing photo deletion must use the authenticated media endpoint'],
  [asset.includes("toUpperCase()==='MEAL'")&&asset.includes("toUpperCase()==='BABY_FOOD'")&&asset.includes("img.loading='lazy'"),'timeline thumbnails must be restricted to visible BABY_FOOD rows and lazy loaded'],
  [asset.includes('family-log-media-viewer')&&asset.includes('openViewer'),'full-photo viewer is missing'],
  [asset.includes('記録は保存しましたが')&&asset.includes('写真だけ再試行できます')&&!asset.includes("action:'delete'"),'failed photo upload must preserve the already-saved Family Log row'],
  [asset.includes('linked_completion?.ok===false')&&asset.includes('saved.linked_completion.message'),'photo save path must preserve canonical linked-completion warning behavior'],
  [asset.includes("credentials:'same-origin'")&&!asset.includes('https://')&&!asset.includes('http://'),'photo browser flow must remain same-origin only'],
  [!asset.includes('navigator.geolocation')&&!asset.toLowerCase().includes('gemini')&&!asset.includes('console.log'),'photo UI must not add location, AI analysis, or private console logging'],
  [shell.includes("FAMILY_LOG_UI_REVISION = 'baby-food-photo1'")&&shell.includes('/assets\\/family-log\\.js'),'outer Family Log asset cache revision is missing'],
  [String(pkg.scripts?.['check:browser-js']||'').includes('family-log-baby-food-media.js')&&String(pkg.scripts?.['check:family-log-js']||'').includes('family-log-baby-food-media.js'),'new browser asset must be syntax checked'],
];

const failed=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failed.length){console.error(failed.join('\n'));process.exit(1);}
console.log('family-log-baby-food-photo-ui-contract: ok');
