import fs from 'node:fs';
import path from 'node:path';

const APP_PATH='src/app.ts';
const APP_FACADE_MAX_BYTES=5000;
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

if(!fs.existsSync(APP_PATH)) throw new Error('src/app.ts compatibility facade is missing');
const app=fs.readFileSync(APP_PATH,'utf8');
const appBytes=Buffer.byteLength(app,'utf8');
if(appBytes>APP_FACADE_MAX_BYTES) throw new Error(`src/app.ts compatibility facade grew beyond ${APP_FACADE_MAX_BYTES} bytes: ${appBytes}`);
for(const forbiddenMarker of ['.DB.prepare(','CREATE TABLE','INSERT INTO ','UPDATE tasks ','DELETE FROM ','SELECT t.','function render','<div class=']){
  if(app.includes(forbiddenMarker)) throw new Error(`src/app.ts facade regained implementation logic: ${forbiddenMarker}`);
}
for(const required of ["from './app-context'","from './errors'","from './app-shell'","from './activity-log'","from './task-visibility'","from './family-external-domain'"]){
  if(!app.includes(required)) throw new Error(`src/app.ts compatibility facade lost retained boundary: ${required}`);
}

for(const forbidden of ['src/app-legacy.ts','src/legacy-app.ts','src/app-monolith.ts']){
  if(fs.existsSync(forbidden)) throw new Error(`giant app.ts must not be renamed into another monolith: ${forbidden}`);
}
for(const file of tsFiles('src')){
  if(file===APP_PATH)continue;
  const bytes=fs.statSync(file).size;
  if(bytes>NEW_MODULE_MAX_BYTES) throw new Error(`${file} is ${bytes} bytes. Do not replace app.ts with another giant TypeScript module; split by responsibility.`);
}

console.log(`app modularity budget ok: app.ts compatibility facade=${appBytes}/${APP_FACADE_MAX_BYTES} bytes; no replacement monolith`);
