import {spawnSync} from 'node:child_process';

const groups=[
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
  ['wave128-fixes',[
    1,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19
  ].map(n=>`node scripts/wave128-fix${n}-smoke.mjs`).join(' && ')],
  ['version','npm run check:version'],
];

const failures=[];
for(const [name,command] of groups){
  console.log(`\n=== regression:${name} ===`);
  const result=spawnSync(command,{shell:true,stdio:'inherit'});
  if(result.status!==0)failures.push(name);
}
if(failures.length){
  console.error(`\nRegression failures: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nRegression suite: all groups passed');
