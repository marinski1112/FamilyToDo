import fs from 'node:fs';
import path from 'node:path';

const ROOT='src';
const TARGETS={
  AppContext:'./app-context', makeContext:'./app-context', memberById:'./app-context',
  AuthRequired:'./errors', BadRequest:'./errors', Forbidden:'./errors',
  layout:'./app-shell', logActivity:'./activity-log',
  taskVisibilitySql:'./task-visibility', taskChildVisibilitySql:'./task-visibility', canAccessTask:'./task-visibility', activityLogVisibilitySql:'./task-visibility',
  createExternalShoppingItemDomain:'./family-external-domain',
  normalizeMilkAmountPresets:'./family-external-domain',
  recordConfiguredQuickActionDomain:'./family-external-domain',
  recordExternalFamilyLogDomain:'./family-external-domain',
  recordExternalPetQuickLogDomain:'./family-external-domain',
  recordGoogleVoiceFamilyLogDomain:'./family-external-domain',
  recordQuickChoreDomain:'./family-external-domain',
  resolveGoogleVoiceInquiryLines:'./family-external-domain',
  startDedicatedSleepDomain:'./family-external-domain',
  stopDedicatedSleepDomain:'./family-external-domain',
  supportsDedicatedSleep:'./family-external-domain',
};

function files(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...files(full));
    else if(entry.isFile()&&entry.name.endsWith('.ts'))out.push(full);
  }
  return out;
}

function rewriteAppImports(file,source){
  let needsLegacyFamilyLog=false;
  const pattern=/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]\.\/app['"];?\s*/g;
  const next=source.replace(pattern,(_full,allType,body)=>{
    const groups=new Map();
    for(const rawPart of body.split(',')){
      let raw=rawPart.trim();
      if(!raw)continue;
      let typeOnly=Boolean(allType);
      if(raw.startsWith('type ')){typeOnly=true;raw=raw.slice(5).trim();}
      const match=raw.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
      if(!match)throw new Error(`${file}: unsupported ./app import specifier: ${raw}`);
      const imported=match[1],local=match[2]||imported;
      if(imported==='familyLog'){
        if(file.replaceAll('\\','/').endsWith('src/family-log-api.ts')&&local==='legacyFamilyLog'){
          needsLegacyFamilyLog=true;
          continue;
        }
        throw new Error(`${file}: familyLog compatibility import requires explicit migration`);
      }
      const target=TARGETS[imported];
      if(!target)throw new Error(`${file}: unknown ./app export ${imported}`);
      const key=`${target}\0${typeOnly?'type':'value'}`;
      const values=groups.get(key)||[];
      values.push(local===imported?imported:`${imported} as ${local}`);
      groups.set(key,values);
    }
    return [...groups.entries()].map(([key,names])=>{
      const [target,kind]=key.split('\0');
      return `import ${kind==='type'?'type ':''}{ ${names.join(', ')} } from '${target}';\n`;
    }).join('');
  });
  let output=next;
  if(needsLegacyFamilyLog){
    const anchor="import { requestGoogleHomeSyncForFamily } from './google-home-request-sync';\n";
    if(!output.includes(anchor))throw new Error(`${file}: family-log dynamic fallback anchor moved`);
    output=output.replace(anchor,anchor+"\nasync function legacyFamilyLog(request:Request,ctx:AppContext):Promise<Response>{\n  const { familyLogPage }=await import('./family-log-page');\n  return familyLogPage(request,ctx);\n}\n");
  }
  return output;
}

let changed=0;
for(const file of files(ROOT)){
  const before=fs.readFileSync(file,'utf8');
  const after=rewriteAppImports(file,before);
  if(after!==before){fs.writeFileSync(file,after);changed++;}
}

function replaceExact(file,from,to){
  const before=fs.readFileSync(file,'utf8');
  if(!before.includes(from))throw new Error(`${file}: expected text not found: ${from}`);
  fs.writeFileSync(file,before.replace(from,to));
}

// Diagnostics remain isolated from the long-lived retained Calendar source, not the deleted facade.
replaceExact('scripts/calendar-inner-stage-diagnostics-contract.mjs',"const app=fs.readFileSync('src/app.ts','utf8');","const calendar=fs.readFileSync('src/calendar-page.ts','utf8');");
replaceExact('scripts/calendar-inner-stage-diagnostics-contract.mjs',".test(app),'temporary inner diagnostics must not leak into the long-lived app/calendar source'",".test(calendar),'temporary inner diagnostics must not leak into the retained Calendar source'");

// Google Home/Tasks domain markers are now owned by the retained external-domain module.
replaceExact('scripts/google-home-foundation-contract.mjs',"const app=fs.readFileSync('src/app.ts','utf8');","const externalDomain=fs.readFileSync('src/family-external-domain.ts','utf8');");
replaceExact('scripts/google-home-foundation-contract.mjs',"assert.ok(app.includes(marker),marker);","assert.ok(externalDomain.includes(marker),marker);");
replaceExact('scripts/google-tasks-sync-contract.mjs',"const app=fs.readFileSync('src/app.ts','utf8');","const externalDomain=fs.readFileSync('src/family-external-domain.ts','utf8');");
replaceExact('scripts/google-tasks-sync-contract.mjs',"assert.ok(app.includes('createExternalShoppingItemDomain'));","assert.ok(externalDomain.includes('createExternalShoppingItemDomain'));");

const modularity=`import fs from 'node:fs';\nimport path from 'node:path';\n\nconst APP_PATH='src/app.ts';\nconst NEW_MODULE_MAX_BYTES=200000;\n\nfunction tsFiles(dir){\n  const out=[];\n  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){\n    const full=path.join(dir,entry.name);\n    if(entry.isDirectory()) out.push(...tsFiles(full));\n    else if(entry.isFile()&&entry.name.endsWith('.ts')) out.push(full.replaceAll('\\\\','/'));\n  }\n  return out;\n}\n\nif(fs.existsSync(APP_PATH)) throw new Error('src/app.ts compatibility facade must remain deleted');\nfor(const forbidden of ['src/app-legacy.ts','src/legacy-app.ts','src/app-monolith.ts']){\n  if(fs.existsSync(forbidden)) throw new Error(\`giant app.ts must not be renamed into another monolith: \${forbidden}\`);\n}\nfor(const file of tsFiles('src')){\n  const source=fs.readFileSync(file,'utf8');\n  if(/(?:from\\s+|import\\s*\\()\\s*['\"]\\.\\/app['\"]/.test(source)) throw new Error(\`\${file} still depends on deleted ./app compatibility surface\`);\n  const bytes=fs.statSync(file).size;\n  if(bytes>NEW_MODULE_MAX_BYTES) throw new Error(\`\${file} is \${bytes} bytes. Do not replace app.ts with another giant TypeScript module; split by responsibility.\`);\n}\n\nconsole.log('app modularity budget ok: app.ts absent, no ./app consumers, no replacement monolith');\n`;
fs.writeFileSync('scripts/app-modularity-budget-contract.mjs',modularity);

for(const file of files(ROOT)){
  const source=fs.readFileSync(file,'utf8');
  if(/(?:from\s+|import\s*\()\s*['"]\.\/app['"]/.test(source))throw new Error(`${file}: residual ./app dependency remains`);
}

fs.rmSync('scripts/_remove-app-facade-codemod.mjs');
fs.rmSync('.github/workflows/remove-app-facade-codemod.yml');
console.log(`app facade codemod complete: rewrote ${changed} TypeScript files and removed temporary codemod files`);
