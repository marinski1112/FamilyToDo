import assert from 'node:assert/strict';
import fs from 'node:fs';

const asset=fs.readFileSync('public/assets/family-log-baby-food-media.js','utf8');
const loader=fs.readFileSync('public/assets/family-log.js','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.ok(loader.indexOf('family-log-baby-food-media.js')>=0&&loader.indexOf('family-log-baby-food-media.js')<loader.indexOf('family-log-core.js'),'photo enhancer must load before Family Log core');
for(const marker of ['accept="image/*"','capture="environment"','MAX_EDGE=1600',"'image/jpeg'",'ctx.drawImage','EXIFメタデータは引き継ぎません'])assert.ok(asset.includes(marker),`photo preparation boundary missing: ${marker}`);
for(const marker of ["fetch('/api/family-log'","action:'save'","fetch('/api/family-log-media'","'x-csrf-token':csrf","'x-family-log-id':String(id)","method:'DELETE'"])assert.ok(asset.includes(marker),`private save/media boundary missing: ${marker}`);
for(const marker of ["toUpperCase()==='MEAL'","toUpperCase()==='BABY_FOOD'","img.loading='lazy'",'family-log-media-viewer','写真だけ再試行できます'])assert.ok(asset.includes(marker),`BABY_FOOD display/retry boundary missing: ${marker}`);
assert.ok(!asset.includes("action:'delete'")&&!asset.includes('navigator.geolocation')&&!asset.toLowerCase().includes('gemini')&&!asset.includes('console.log'),'photo UI must not rollback logs or add location/AI/private console logging');
assert.ok(shell.includes("FAMILY_LOG_UI_REVISION = 'baby-food-photo1'")&&shell.includes('FAMILY_LOG_UI_REVISION}`'),'outer Family Log cache revision is missing');
assert.ok(String(pkg.scripts?.['check:browser-js']||'').includes('family-log-baby-food-media.js'),'new browser asset must be syntax checked');

console.log('family-log baby-food photo UI contract ok');
