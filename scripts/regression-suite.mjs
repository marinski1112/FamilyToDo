import {spawnSync} from 'node:child_process';
import {activeRegressionGroups} from './regression-manifest.mjs';

const failures=[];
const started=Date.now();
let totalChecks=0;
for(const group of activeRegressionGroups){
  console.log(`\n######## regression group: ${group.name} ########`);
  for(const [name,command] of group.checks){
    totalChecks++;
    const checkStarted=Date.now();
    console.log(`\n=== regression:${group.name}:${name} ===`);
    const result=spawnSync(command,{shell:true,stdio:'inherit'});
    const seconds=((Date.now()-checkStarted)/1000).toFixed(1);
    if(result.status!==0){
      failures.push(`${group.name}/${name}`);
      console.error(`--- regression:${group.name}:${name} FAILED (${seconds}s) ---`);
    }else{
      console.log(`--- regression:${group.name}:${name} ok (${seconds}s) ---`);
    }
  }
}

const total=((Date.now()-started)/1000).toFixed(1);
if(failures.length){
  console.error(`\nRegression failures (${failures.length}): ${failures.join(', ')}`);
  console.error(`Active regression suite completed in ${total}s`);
  process.exit(1);
}
console.log(`\nActive regression suite: all ${totalChecks} checks passed in ${total}s`);
