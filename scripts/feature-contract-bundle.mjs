import {spawnSync} from 'node:child_process';

const groups={
  'calendar-imports':[
    ['calendar-presentation',['node','scripts/calendar-presentation-contract.mjs']],
    ['calendar-touch',['node','scripts/calendar-touch-contract.mjs']],
    ['recurring-calendar-navigation',['node','scripts/recurring-calendar-navigation-contract.mjs']],
    ['platform-integration',['node','scripts/platform-integration-contract.mjs']],
    ['calendar-colors',['node','scripts/calendar-color-contract.mjs']],
    ['calendar-projection-ui',['node','scripts/calendar-projection-ui-contract.mjs']],
    ['calendar-projection-lifecycle',['node','scripts/calendar-projection-lifecycle-contract.mjs']],
    ['calendar-projection-queue',['node','scripts/calendar-projection-queue-contract.mjs']],
    ['calendar-inbound-projection',['node','scripts/calendar-inbound-projection-contract.mjs']],
    ['calendar-sync-retry',['node','scripts/calendar-sync-retry-contract.mjs']],
    ['ics-import',['node','scripts/ics-import-contract.mjs']],
    ['ics-import-format',['node','scripts/ics-import-format-contract.mjs']],
    ['import-recovery',['node','scripts/calendar-import-recovery-contract.mjs']],
    ['timezone-import',['node','scripts/timezone-import-contract.mjs']],
  ],
  'google-integrations':[
    ['google-integration',['node','scripts/google-integration-contract.mjs']],
    ['google-calendar-inbound',['node','scripts/google-calendar-inbound-contract.mjs']],
    ['calendar-sync-foundation',['node','scripts/calendar-sync-foundation-contract.mjs']],
    ['google-home-quick',['node','scripts/google-home-quick-contract.mjs']],
    ['google-home-scene',['node','scripts/google-home-scene-contract.mjs']],
    ['google-home-sync',['node','scripts/google-home-sync-contract.mjs']],
    ['google-home-voice',['node','scripts/google-home-voice-contract.mjs']],
    ['google-home-foundation',['node','scripts/google-home-foundation-contract.mjs']],
    ['google-home-family-log',['node','scripts/google-home-family-log-contract.mjs']],
    ['google-tasks-voice',['node','scripts/google-tasks-voice-contract.mjs']],
    ['google-tasks-sync',['node','scripts/google-tasks-sync-contract.mjs']],
    ['platform-auth',['node','scripts/platform-auth-contract.mjs']],
  ],
  'ui-product':[
    ['ui-product',['node','scripts/ui-product-contract.mjs']],
    ['message-delete-error',['node','scripts/message-delete-error-contract.mjs']],
    ['task-presentation',['node','scripts/task-presentation-contract.mjs']],
    ['expired-task',['node','scripts/expired-task-contract.mjs']],
    ['task-deletion-integrity',['bash','scripts/task-deletion-integrity-contract.sh']],
    ['activity-log-push-diagnostics',['bash','scripts/activity-log-push-diagnostics-contract.sh']],
    ['private-parent-visibility',['bash','scripts/private-parent-visibility-contract.sh']],
    ['private-task-foundation',['bash','scripts/private-task-foundation-contract.sh']],
    ['settings-diagnostics',['node','scripts/settings-diagnostics-contract.mjs']],
    ['family-log',['node','scripts/family-log-contract.mjs']],
    ['family-log-label-wrap',['node','scripts/family-log-label-wrap-contract.mjs']],
    ['family-log-quick-chore-provenance',['bash','scripts/family-log-quick-chore-provenance-contract.sh']],
    ['family-log-subject-timer',['node','scripts/family-log-subject-timer-contract.mjs']],
    ['family-log-dashboard',['node','scripts/family-log-dashboard-contract.mjs']],
    ['family-log-daily-ux',['node','scripts/family-log-daily-ux-contract.mjs']],
    ['family-log-visibility',['node','scripts/family-log-visibility-contract.mjs']],
    ['family-log-overview-sleep',['node','scripts/family-log-overview-sleep-contract.mjs']],
    ['family-log-scheduling',['node','scripts/family-log-scheduling-contract.mjs']],
    ['family-log-import-repair',['node','scripts/family-log-import-repair-contract.mjs']],
    ['family-log-import-protocol',['node','scripts/family-log-import-protocol-contract.mjs']],
    ['family-log-import-integrity',['node','scripts/family-log-import-integrity-contract.mjs']],
    ['family-log-completion',['bash','scripts/family-log-completion-contract.sh']],
    ['family-ai-actions',['node','scripts/family-ai-actions-contract.mjs']],
    ['family-ai-provider',['node','scripts/family-ai-provider-contract.mjs']],
    ['family-ai-foundation',['node','scripts/family-ai-foundation-contract.mjs']],
    ['family-ai-statistics',['node','scripts/family-ai-statistics-contract.mjs']],
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
