import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const app=retainedAppContractSource();
const familyLog=fs.readFileSync('public/assets/family-log.js','utf8')+(fs.existsSync('public/assets/family-log-core.js')?'\n'+fs.readFileSync('public/assets/family-log-core.js','utf8'):'');
const migration=fs.readFileSync('migrations/0024_wave87_custom_timer.sql','utf8');

assert.ok(app.includes("adultAggregate=showAdultLogs&&subjectParam==='adult'"),'adult aggregate mode must remain explicitly gated');
assert.ok(app.includes('l.created_by=?'),'adult aggregate log queries must retain creator filtering');
assert.ok(app.includes("selectedSubject||adultAggregate?'':"),'Family Log empty-state presentation must distinguish subject/aggregate selection');
assert.ok(app.includes('FAMILY_LOG_SUBJECT_TYPES'),'Family Log subject-type allowlist must remain present');
for(const marker of ["PET_PRESETS={CAT:","DOG:['MEAL'"])
  assert.ok(familyLog.includes(marker),`missing pet preset marker: ${marker}`);
assert.ok(familyLog.includes("action:'timer_start',log_type:'TIMER'"),'custom timer quick action must retain TIMER recording semantics');
assert.ok(app.includes('timer_label'),'timer label persistence must remain wired');
assert.ok(app.includes("String(timer.timer_label||'')"),'timer labels must continue to normalize null values for presentation');
assert.ok(migration.includes('ADD COLUMN timer_label TEXT NULL'),'custom timer migration must retain nullable timer label storage');

console.log('family-log-subject-timer-contract: adult aggregation, subject types, pet presets, and timer labels ok');
