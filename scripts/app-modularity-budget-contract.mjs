import fs from 'node:fs';
import path from 'node:path';

const APP_PATH='src/app.ts';
const APP_MAX_BYTES=407156;
const NEW_MODULE_MAX_BYTES=200000;

function tsFiles(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...tsFiles(full));
    else if(entry.isFile()&&entry.name.endsWith('.ts')) out.push(full.replaceAll('\\','/'));
  }
  return out;
}

const app=fs.readFileSync(APP_PATH,'utf8');
const appBytes=Buffer.byteLength(app,'utf8');
if(appBytes>APP_MAX_BYTES){
  throw new Error(`src/app.ts grew from the frozen modularization baseline: ${appBytes} > ${APP_MAX_BYTES} bytes. Extract responsibility to a retained module instead of enlarging app.ts.`);
}

for(const forbidden of ['src/app-legacy.ts','src/legacy-app.ts','src/app-monolith.ts']){
  if(fs.existsSync(forbidden)) throw new Error(`giant app.ts must not be renamed into another monolith: ${forbidden}`);
}

for(const file of tsFiles('src')){
  if(file===APP_PATH) continue;
  const bytes=fs.statSync(file).size;
  if(bytes>NEW_MODULE_MAX_BYTES){
    throw new Error(`${file} is ${bytes} bytes. Do not replace app.ts with another giant TypeScript module; split by responsibility.`);
  }
}

for(const locationMarker of ['LocationProvider','LocationQueryService','NormalizedLocationPoint','location_devices','member_location_history']){
  if(app.includes(locationMarker)) throw new Error(`new Location responsibility must not be added to src/app.ts: ${locationMarker}`);
}

console.log(`app modularity budget ok: app.ts=${appBytes}/${APP_MAX_BYTES} bytes; no replacement monolith`);
