import {spawnSync} from 'node:child_process';
import {legacyRegressionChecks} from './regression-manifest.mjs';

const failures=[];
const started=Date.now();
for(const [name,command] of legacyRegressionChecks){
  const checkStarted=Date.now();
  console.log(`\n=== legacy-regression:${name} ===`);
  const result=spawnSync(command,{shell:true,stdio:'inherit'});
  const seconds=((Date.now()-checkStarted)/1000).toFixed(1);
  if(result.status!==0){
    failures.push(name);
    console.error(`--- legacy-regression:${name} FAILED (${seconds}s) ---`);
  }else{
    console.log(`--- legacy-regression:${name} ok (${seconds}s) ---`);
  }
}
const total=((Date.now()-started)/1000).toFixed(1);
if(failures.length){
  console.error(`\nLegacy regression failures (${failures.length}): ${failures.join(', ')}`);
  console.error(`Legacy audit completed in ${total}s`);
  process.exit(1);
}
console.log(`\nLegacy audit: all ${legacyRegressionChecks.length} checks passed in ${total}s`);
