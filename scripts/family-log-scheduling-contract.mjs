import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const app=retainedAppContractSource();
const index=fs.readFileSync('src/index.ts','utf8');
const diagnostics=fs.readFileSync('src/runtime-diagnostics.ts','utf8');
const familyLog=fs.readFileSync('public/assets/family-log.js','utf8')+(fs.existsSync('public/assets/family-log-core.js')?'\n'+fs.readFileSync('public/assets/family-log-core.js','utf8'):'');
const css=fs.readFileSync('public/assets/family.css','utf8');
const migration=fs.readFileSync('migrations/0031_wave95_quick_chore_weekdays.sql','utf8');

for(const marker of [
  'supportsDedicatedSleep',
  "subject_kind IN ('BABY','CHILD')",
  'familyQuickChoreWeekdayBit(selectedDate)',
  'weekday_mask',
  'family-log-subject-edit',
  'aria-label="管理に戻る"',
  'family-log-back-icon',
  "type!=='TIMER'",
  'familyLogOverviewQuickTypes',
]) assert.ok(app.includes(marker),marker);
assert.ok(familyLog.includes('input[name="weekday"]:checked'),'weekday checkbox selection must remain wired');
assert.ok(css.includes('repeat(3,minmax(0,1fr))'),'Family Log management grid must retain three columns');
assert.ok(css.includes('@media(max-width:319px)'),'narrow-screen Family Log fallback must remain present');
assert.ok(!app.includes('この対象の表示項目・設定'),'obsolete second subject-edit step must remain removed');
assert.doesNotMatch(app,/family-log-subject-edit[^>]+href=/,'management subject edit must remain in-place rather than navigation-based');
assert.ok(index.includes("NOT IN ('BABY','CHILD')")||diagnostics.includes("NOT IN ('BABY','CHILD')"),'non-child subject filtering must remain explicit');
for(const marker of ['DEFAULT 127','weekday_mask']) assert.ok(migration.includes(marker),marker);

const db=path.join(os.tmpdir(),`familytodo-family-log-scheduling-${process.pid}-${Date.now()}.sqlite`);
try {
  for(const file of fs.readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort()) {
    execFileSync('sqlite3',[db],{input:fs.readFileSync(path.join('migrations',file),'utf8')});
  }
  const defaultValue=execFileSync('sqlite3',[db,"SELECT dflt_value FROM pragma_table_info('family_quick_chores') WHERE name='weekday_mask'"],{encoding:'utf8'}).trim();
  assert.equal(defaultValue,'127','family_quick_chores.weekday_mask must default to all seven days');
} finally {
  try { fs.unlinkSync(db); } catch {}
}

console.log('family-log-scheduling-contract: weekday scheduling, subject editing, filtering, responsive management UI, and schema default ok');
