import {spawnSync} from 'node:child_process';

const groups={
  'calendar-imports':[
    ['calendar-layout',['node','scripts/wave123-smoke.mjs']],
    ['calendar-current',['node','scripts/wave128-smoke.mjs']],
    ['calendar-presentation',['node','scripts/wave128-fix23-smoke.mjs']],
    ['calendar-colors',['node','scripts/calendar-color-contract.mjs']],
    ['ics-import',['node','scripts/ics-import-contract.mjs']],
    ['event-reset-import',['node','scripts/wave128-fix21-smoke.mjs']],
  ],
  'google-integrations':[
    ['google-home',['node','scripts/wave125-smoke.mjs']],
    ['google-credentials',['node','scripts/wave126-smoke.mjs']],
    ['ai-model-watch',['node','scripts/wave127-smoke.mjs']],
    ['calendar-delete-idempotency',['node','scripts/wave128-fix13-smoke.mjs']],
    ['calendar-retry-normalization',['node','scripts/wave128-fix16-smoke.mjs']],
    ['calendar-bounded-sync',['node','scripts/wave128-fix18-smoke.mjs']],
    ['calendar-duplicate-prevention',['node','scripts/wave128-fix20-smoke.mjs']],
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
