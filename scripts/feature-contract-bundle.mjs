import {spawnSync} from 'node:child_process';

const groups={
  'calendar-imports':[
    ['calendar-presentation',['node','scripts/calendar-presentation-contract.mjs']],
    ['calendar-touch',['node','scripts/calendar-touch-contract.mjs']],
    ['platform-integration',['node','scripts/platform-integration-contract.mjs']],
    ['calendar-colors',['node','scripts/calendar-color-contract.mjs']],
    ['calendar-projection-ui',['node','scripts/calendar-projection-ui-contract.mjs']],
    ['calendar-projection-lifecycle',['node','scripts/calendar-projection-lifecycle-contract.mjs']],
    ['ics-import',['node','scripts/ics-import-contract.mjs']],
    ['import-recovery',['node','scripts/calendar-import-recovery-contract.mjs']],
  ],
  'google-integrations':[
    ['google-integration',['node','scripts/google-integration-contract.mjs']],
    ['google-home-quick',['node','scripts/google-home-quick-contract.mjs']],
    ['google-home-scene',['node','scripts/google-home-scene-contract.mjs']],
    ['google-home-sync',['node','scripts/google-home-sync-contract.mjs']],
    ['google-home-voice',['node','scripts/google-home-voice-contract.mjs']],
    ['google-home-family-log',['node','scripts/google-home-family-log-contract.mjs']],
    ['platform-auth',['node','scripts/platform-auth-contract.mjs']],
  ],
  'ui-product':[
    ['ui-product',['node','scripts/ui-product-contract.mjs']],
    ['family-log',['node','scripts/family-log-contract.mjs']],
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
