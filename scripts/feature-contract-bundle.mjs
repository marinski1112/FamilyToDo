import {spawnSync} from 'node:child_process';

const groups={
  'calendar-imports':[
    ['calendar-presentation',['node','scripts/calendar-presentation-contract.mjs']],
    ['platform-integration',['node','scripts/platform-integration-contract.mjs']],
    ['calendar-colors',['node','scripts/calendar-color-contract.mjs']],
    ['ics-import',['node','scripts/ics-import-contract.mjs']],
    ['import-recovery',['node','scripts/calendar-import-recovery-contract.mjs']],
  ],
  'google-integrations':[
    ['google-integration',['node','scripts/google-integration-contract.mjs']],
    ['google-home-quick',['node','scripts/google-home-quick-contract.mjs']],
  ],
  'ui-product':[
    ['ui-product',['node','scripts/ui-product-contract.mjs']],
    ['version',['node','scripts/version-contract.mjs']],
  ],
};

const requested=process.argv[2];
const checks=groups[requested];
if(!checks){
  console.error(`Unknown feature contract bundle: ${requested||'(missing)'}`);
  process.exit(2);
}

const failures=[];
for(const [name,[command,...args]] of checks){
  console.log(`\n--- feature contract: ${requested}/${name} ---`);
  const result=spawnSync(command,args,{stdio:'inherit',shell:false});
  if(result.status!==0)failures.push(name);
}
if(failures.length){
  console.error(`Feature contract failures (${requested}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`Feature contract bundle ${requested}: ok (${checks.length} checks)`);
