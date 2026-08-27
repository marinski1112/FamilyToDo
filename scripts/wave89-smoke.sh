#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
node --input-type=module <<'JS'
import fs from 'node:fs';
import {chunkPlan,validateChunkOffset,validateFinishCounts} from './src/family-log-import-protocol.js';
const records=Array.from({length:2500},(_,i)=>({occurred_at:`2026-01-${String(i%28+1).padStart(2,'0')}T00:00:00Z`,log_type:i===2499?'VACCINE':'MILK',amount:i===2499?null:60,unit:i===2499?null:'ml',value_text:i===2499?'架空ワクチン':null}));
const plan=chunkPlan(records.length);if(plan.length!==25||plan.some((x,i)=>x.offset!==i*100||x.length!==100))throw new Error('2500-record plan');
let processed=0;for(const x of plan){const next=validateChunkOffset(processed,2500,x.offset,x.length);processed=next.nextProcessedCount;}
try{validateChunkOffset(100,2500,200,100);throw new Error('skipped offset accepted');}catch(e){if(e.message==='skipped offset accepted')throw e;}
const retry=validateChunkOffset(1300,2500,1200,100);if(!retry.retry||retry.nextProcessedCount!==1300)throw new Error('retry advanced progress');
try{validateFinishCounts('IMPORTING',false,2499,2500,2499,0,0);throw new Error('early finish accepted');}catch(e){if(e.message==='early finish accepted')throw e;}
validateFinishCounts('IMPORTING',false,2500,2500,2498,1,1);
const payload=JSON.stringify({format:'familytodo-family-log-import-v1',records,conversion_notes:'x'.repeat(1100000)});if(payload.length<1000000)throw new Error('fixture too small');
const browser=fs.readFileSync('public/assets/family-log-import.js','utf8'),server=fs.readFileSync('src/family-log-import.ts','utf8');
if(!/createElement|textContent/.test(browser)||/out\.innerHTML|source_text.*activity/.test(browser))throw new Error('safe DOM assertions failed');
for(const expected of ['VACCINE','LOOKUP_SIZE=90','validateChunkOffset','chunk_manifest_json'])if(!server.includes(expected))throw new Error(`missing ${expected}`);
JS
cols="$(sqlite3 "$db" 'PRAGMA table_info(family_log_import_batches)' | cut -d'|' -f2)"
node -e 'const cols=new Set(process.argv[1].split("\n"));for(const c of ["status","processed_count","failed_at","completed_at","chunk_manifest_json"])if(!cols.has(c))throw Error(`missing ${c}`)' "$cols"
echo 'wave89/wave90 import smoke: ok'
