import fs from 'node:fs';
import path from 'node:path';

const APP_PATH='src/app.ts';
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

if(fs.existsSync(APP_PATH)) throw new Error('src/app.ts monolith must remain removed after retained ownership migration');

for(const forbidden of ['src/app-legacy.ts','src/legacy-app.ts','src/app-monolith.ts']){
  if(fs.existsSync(forbidden)) throw new Error(`giant app.ts must not be renamed into another monolith: ${forbidden}`);
}

for(const file of tsFiles('src')){
  const bytes=fs.statSync(file).size;
  if(bytes>NEW_MODULE_MAX_BYTES){
    throw new Error(`${file} is ${bytes} bytes. Do not replace app.ts with another giant TypeScript module; split by responsibility.`);
  }
  const source=fs.readFileSync(file,'utf8');
  if(source.includes("from './app'")||source.includes('from "./app"')) throw new Error(`${file} must not import removed src/app.ts`);
}

console.log('app modularity budget ok: src/app.ts removed; no replacement monolith or direct imports');
