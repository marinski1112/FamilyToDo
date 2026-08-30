import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const timezone=fs.readFileSync('src/timezone.ts','utf8');
const familyLogImport=fs.readFileSync('src/family-log-import.ts','utf8');
const familyAi=fs.readFileSync('src/family-ai.ts','utf8');
const calendar=fs.readFileSync('src/google-calendar.ts','utf8');
const migrations=fs.readdirSync('migrations')
  .filter(name=>name.endsWith('.sql'))
  .sort()
  .map(name=>fs.readFileSync(path.join('migrations',name),'utf8'))
  .join('\n');

for(const marker of ['parseImportDateTime','validateTimezone','timezoneOffsetMinutesAt']) {
  assert.ok(timezone.includes(marker),marker);
}
for(const marker of ['repair_preview','repair_apply','repair_rollback','updated_at=created_at']) {
  assert.ok(familyLogImport.includes(marker),marker);
}
assert.ok(!familyAi.includes("datetime(occurred_at,'+9 hours')"),'Family AI must not retain fixed +9 conversion');
assert.ok(!familyAi.includes("datetime(l.occurred_at,'+9 hours')"),'Family AI log queries must not retain fixed +9 conversion');
assert.ok(!calendar.includes("+'+09:00'"),'Google Calendar must not retain fixed +09 suffix conversion');
for(const marker of ['member_permissions','family_log_time_repairs','Asia/Tokyo']) {
  assert.ok(migrations.includes(marker),`migration marker ${marker}`);
}

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'familytodo-timezone-contract-'));
try {
  execFileSync(process.platform==='win32'?'npx.cmd':'npx',[
    'tsc','src/timezone.ts','--outDir',tmp,'--module','esnext','--target','es2022','--skipLibCheck'
  ],{stdio:'inherit'});
  const helper=await import(pathToFileURL(path.join(tmp,'timezone.js')).href);
  assert.equal(helper.parseImportDateTime('2026-03-04T02:05:00+09:00','Asia/Tokyo'),'2026-03-04 02:05:00');
  assert.equal(helper.parseImportDateTime('2026-03-03T17:05:00Z','Asia/Tokyo'),'2026-03-04 02:05:00');
  assert.equal(helper.parseImportDateTime('2026-03-04T02:05:00','Asia/Tokyo'),'2026-03-04 02:05:00');
  assert.equal(helper.addWallClockMinutes('2026-03-03 17:05:00',540),'2026-03-04 02:05:00');
  assert.equal(helper.validateTimezone('America/New_York'),true);
  assert.equal(helper.validateTimezone('not/a-zone'),false);
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}

console.log('timezone-import-contract: timezone parsing, repair markers, fixed-offset removal, and migration markers ok');
