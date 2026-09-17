import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const scheduleSource=fs.readFileSync('src/scheduled-dispatch.ts','utf8');
const transpiled=ts.transpileModule(scheduleSource,{
  compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022},
}).outputText;
const scheduleModule=await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
const {scheduledDispatchPlanAt}=scheduleModule;

const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
assert.deepEqual(config.triggers?.crons,['* * * * *'],'FamilyToDo must use one every-minute Cron trigger');

for(let hour=0;hour<24;hour++){
  for(let minute=0;minute<60;minute++){
    const scheduledTime=Date.UTC(2026,8,17,hour,minute,0);
    const actual=scheduledDispatchPlanAt(scheduledTime);
    const expected={
      fiveMinuteCore:minute%5===0,
      googleTasksInbound:minute%5===3,
      calendarWatchRenewal:minute===7||minute===37,
      hourlyCleanup:minute===17,
      dailyNotificationAudit:hour===18&&minute===29,
    };
    assert.deepEqual(actual,expected,`dispatch mismatch at ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} UTC`);
  }
}

const index=fs.readFileSync('src/index.ts','utf8');
for(const marker of [
  "(controller as ScheduledController&{scheduledTime?:number}).scheduledTime",
  "scheduledDispatchPlanAt(scheduledTime)",
  'if(plan.googleTasksInbound)',
  'if(plan.fiveMinuteCore)',
  'if(plan.hourlyCleanup)',
  'if(plan.dailyNotificationAudit)',
  'if(plan.calendarWatchRenewal)',
]){
  assert.ok(index.includes(marker),`missing scheduled dispatch marker: ${marker}`);
}
assert.ok(!index.includes("controller.cron==='"),'scheduled handler must not depend on legacy individual Cron strings');

console.log('Scheduled Cron consolidation contract OK: all 1,440 UTC minutes preserve legacy dispatch timing');
