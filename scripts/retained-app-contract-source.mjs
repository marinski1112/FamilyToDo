import fs from 'node:fs';
import path from 'node:path';

function sourceFiles(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...sourceFiles(full));
    else if(entry.isFile()&&entry.name.endsWith('.ts'))out.push(full.replaceAll('\\','/'));
  }
  return out;
}

/**
 * Contract-only view of the application source after the app.ts monolith split.
 * It intentionally concatenates retained TypeScript owners so historical
 * string/regex contracts can keep testing behavior without forcing logic back
 * into the compatibility facade.
 */
export function retainedAppContractSource(){
  return sourceFiles('src').sort().map(file=>`\n/* contract-source:${file} */\n${fs.readFileSync(file,'utf8')}`).join('\n');
}
