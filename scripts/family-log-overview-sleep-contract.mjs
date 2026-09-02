import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const app=retainedAppContractSource();
const familyLog=read('public/assets/family-log.js')+(fs.existsSync('public/assets/family-log-core.js')?'\n'+read('public/assets/family-log-core.js'):'');
const css=read('public/assets/family.css');
const migration=read('migrations/0030_wave94_family_log_overview.sql');

for(const marker of [
  'All-view intentionally does not union',
  'familyLogOverviewQuickTypes',
  "action==='sleep_start'",
  "action==='sleep_stop'",
  "action==='sleep_adjust'",
  "subject_kind IN ('BABY','CHILD')",
  "log_type='SLEEP'",
  'SLEEP_TIMER_WARNING_MINUTES',
  'SLEEP_TIMER_CONFIRM_MINUTES',
  'SLEEP_TIMER_MAX_ADJUST_MINUTES',
  "type!=='TIMER'",
  'family_log_import_batches',
  "countFor('SLEEP')",
]) assert.ok(app.includes(marker),`missing Family Log overview/sleep marker: ${marker}`);

for(const marker of ["action:'sleep_start'","action:'sleep_stop'","action:'sleep_adjust'"])
  assert.ok(familyLog.includes(marker),`missing Family Log client sleep marker: ${marker}`);
for(const marker of ['height:44px','font-size:17px','font-size:12px'])
  assert.ok(css.includes(marker),`missing Family Log overview presentation marker: ${marker}`);
for(const marker of ['DEFAULT 0','overview_quick_types_json'])
  assert.ok(migration.includes(marker),`missing Family Log overview migration marker: ${marker}`);
assert.ok(!app.includes(':FAMILY_LOG_TYPES.filter(type=>(adultAggregate?adultSubjects'),'All-view enabled-type union must remain disabled');

console.log('family-log-overview-sleep-contract: overview, sleep controls, presentation, import markers, and migration defaults ok');
