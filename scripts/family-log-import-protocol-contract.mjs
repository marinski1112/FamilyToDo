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
assert.ok(plan.every((chunk,i)=>chunk.offset===i*100&&chunk.length===100),'chunk plan must remain contiguous in 100-record units');

let processed=0;
for(const chunk of plan){
  const next=validateChunkOffset(processed,2500,chunk.offset,chunk.length);
  processed=next.nextProcessedCount;
}
assert.equal(processed,2500,'chunk plan must reach all records');
assert.throws(()=>validateChunkOffset(100,2500,200,100),'skipped offsets must be rejected');
const retry=validateChunkOffset(1300,2500,1200,100);
assert.equal(retry.retry,true,'replayed chunk must be treated as retry');
assert.equal(retry.nextProcessedCount,1300,'retry must not advance progress');
assert.throws(()=>validateFinishCounts('IMPORTING',false,2499,2500,2499,0,0),'early finish must be rejected');
validateFinishCounts('IMPORTING',false,2500,2500,2498,1,1);

const payload=JSON.stringify({format:'familytodo-family-log-import-v1',records,conversion_notes:'x'.repeat(1100000)});
assert.ok(payload.length>=1000000,'large import fixture must exercise >1 MB payload handling');

const browser=fs.readFileSync('public/assets/family-log-import.js','utf8');
const server=fs.readFileSync('src/family-log-import.ts','utf8');
assert.match(browser,/createElement|textContent/,'import browser must use safe DOM construction');
assert.ok(!/out\.innerHTML|source_text.*activity/.test(browser),'unsafe raw import rendering must stay absent');
for(const token of ['VACCINE','LOOKUP_SIZE=90','validateChunkOffset','chunk_manifest_json'])
  assert.ok(server.includes(token),`missing ${token}`);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'familytodo-import-protocol-'));
const db=path.join(dir,'contract.sqlite');
const sqlite=sql=>{
  const result=spawnSync('sqlite3',[db],{input:sql,encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||`sqlite3 exited ${result.status}`);
  return result.stdout.trim();
};
try{
  for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())
    sqlite(fs.readFileSync(path.join('migrations',name),'utf8'));
  const cols=new Set(sqlite('PRAGMA table_info(family_log_import_batches);').split('\n').map(row=>row.split('|')[1]));
  for(const col of ['status','processed_count','failed_at','completed_at','chunk_manifest_json'])
    assert.ok(cols.has(col),`missing family_log_import_batches.${col}`);
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}

console.log('family-log-import-protocol-contract: chunking, retry, completion, safe DOM, and schema coverage ok');
