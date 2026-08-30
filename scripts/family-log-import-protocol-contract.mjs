import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chunkPlan,validateChunkOffset,validateFinishCounts} from '../src/family-log-import-protocol.js';

const records=Array.from({length:2500},(_,i)=>({
  occurred_at:`2026-01-${String(i%28+1).padStart(2,'0')}T00:00:00Z`,
  log_type:i===2499?'VACCINE':'MILK',
  amount:i===2499?null:60,
  unit:i===2499?null:'ml',
  value_text:i===2499?'架空ワクチン':null,
}));

const plan=chunkPlan(records.length);
assert.equal(plan.length,25,'2500 records must produce 25 chunks');
assert.ok(plan.every((entry,index)=>entry.offset===index*100&&entry.length===100),'chunk offsets and lengths must remain stable');

let processed=0;
for(const entry of plan){
  processed=validateChunkOffset(processed,2500,entry.offset,entry.length).nextProcessedCount;
}
assert.equal(processed,2500,'sequential chunk validation must reach the full record count');
assert.throws(()=>validateChunkOffset(100,2500,200,100),'skipped offsets must be rejected');
const retry=validateChunkOffset(1300,2500,1200,100);
assert.equal(retry.retry,true,'previous chunk retry must be recognized');
assert.equal(retry.nextProcessedCount,1300,'retry must not advance progress');
assert.throws(()=>validateFinishCounts('IMPORTING',false,2499,2500,2499,0,0),'early finish must be rejected');
validateFinishCounts('IMPORTING',false,2500,2500,2498,1,1);

const payload=JSON.stringify({format:'familytodo-family-log-import-v1',records,conversion_notes:'x'.repeat(1100000)});
assert.ok(payload.length>=1000000,'large import fixture must remain at least 1 MB');

const browser=fs.readFileSync('public/assets/family-log-import.js','utf8');
const server=fs.readFileSync('src/family-log-import.ts','utf8');
assert.match(browser,/createElement|textContent/,'import UI must keep safe DOM rendering markers');
assert.doesNotMatch(browser,/out\.innerHTML|source_text.*activity/,'import UI must not regress to unsafe output rendering markers');
for(const expected of ['VACCINE','LOOKUP_SIZE=90','validateChunkOffset','chunk_manifest_json']){
  assert.ok(server.includes(expected),`server import implementation must retain ${expected}`);
}

const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'familytodo-import-contract-'));
const dbPath=path.join(tempDir,'contract.sqlite');
try{
  const migrations=fs.readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort();
  for(const migration of migrations){
    const result=spawnSync('sqlite3',[dbPath],{input:fs.readFileSync(path.join('migrations',migration),'utf8'),encoding:'utf8'});
    assert.equal(result.status,0,`migration ${migration} must apply for import contract: ${result.stderr||''}`);
  }
  const pragma=spawnSync('sqlite3',[dbPath,'PRAGMA table_info(family_log_import_batches);'],{encoding:'utf8'});
  assert.equal(pragma.status,0,`family_log_import_batches schema inspection must succeed: ${pragma.stderr||''}`);
  const columns=new Set(pragma.stdout.trim().split('\n').filter(Boolean).map(line=>line.split('|')[1]));
  for(const column of ['status','processed_count','failed_at','completed_at','chunk_manifest_json']){
    assert.ok(columns.has(column),`family_log_import_batches must retain ${column}`);
  }
} finally {
  fs.rmSync(tempDir,{recursive:true,force:true});
}

console.log('family-log-import-protocol-contract: chunking, retry/finalization, safe rendering, server markers, and import-batch schema ok');
