import {spawnSync} from 'node:child_process';

const checks=[
  ['legacy-domain','npm run check:domain-smoke'],
  ['wave117','npm run check:wave117'],
  ['wave118','npm run check:wave118'],
  ['wave119','npm run check:wave119'],
  ['wave120','npm run check:wave120'],
  ['wave121','npm run check:wave121'],
  ['wave122','npm run check:wave122'],
  ['wave123','npm run check:wave123'],
  ['form-audit','npm run check:wave123-form-audit'],
  ['wave124','npm run check:wave124'],
  ['wave125','npm run check:wave125'],
  ['wave126','npm run check:wave126'],
  ['wave127','npm run check:wave127'],
  ['wave128','npm run check:wave128'],
  ...[1,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n=>[`wave128-fix${n}`,`node scripts/wave128-fix${n}-smoke.mjs`]),
  ['version','npm run check:version'],
];

const failures=[];
const started=Date.now();
for(const [name,command] of checks){
  const checkStarted=Date.now();
  console.log(`\n=== regression:${name} ===`);
  const result=spawnSync(command,{shell:true,stdio:'inherit'});
  const seconds=((Date.now()-checkStarted)/1000).toFixed(1);
  if(result.status!==0){
    failures.push(name);
    console.error(`--- regression:${name} FAILED (${seconds}s) ---`);
  }else{
    console.log(`--- regression:${name} ok (${seconds}s) ---`);
  }
}

const total=((Date.now()-started)/1000).toFixed(1);
if(failures.length){
  console.error(`\nRegression failures (${failures.length}): ${failures.join(', ')}`);
  console.error(`Regression suite completed in ${total}s`);
  process.exit(1);
}
console.log(`\nRegression suite: all ${checks.length} checks passed in ${total}s`);
