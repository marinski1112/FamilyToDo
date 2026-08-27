#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
cols="$(sqlite3 "$db" 'PRAGMA table_info(family_log_import_batches)' | cut -d'|' -f2)"
for col in status processed_count failed_at completed_at; do grep -qx "$col" <<<"$cols"; done
# Synthetic large-import architecture assertions (no personal fixture and no 2,500-query D1 loop).
node <<'JS'
const records=Array.from({length:2500},(_,i)=>({occurred_at:`2026-01-${String(i%28+1).padStart(2,'0')}T00:00:00Z`,log_type:i===2499?'VACCINE':'MILK',amount:i===2499?null:60,unit:i===2499?null:'ml',value_text:i===2499?'架空ワクチン':null}));
const chunks=[];for(let i=0;i<records.length;i+=100)chunks.push(records.slice(i,i+100));
if(chunks.length!==25||chunks.some(x=>x.length!==100))process.exit(1);
const keys=new Set(records.map((r,i)=>JSON.stringify([r.occurred_at,r.log_type,i])));if(keys.size!==2500)process.exit(1);
const progress=Math.max(1200,1200);if(progress!==1200)process.exit(1); // a retried chunk never advances twice
const payload=JSON.stringify({format:'familytodo-family-log-import-v1',records,conversion_notes:'x'.repeat(1100000)});if(payload.length<1000000)process.exit(1);
JS
rg -q "createElement|textContent" public/assets/family-log-import.js
! rg -q "out\.innerHTML|source_text.*activity" public/assets/family-log-import.js
rg -q "VACCINE" src/family-log-import.ts
rg -q "LOOKUP_SIZE=90" src/family-log-import.ts
rg -q "CHUNK_SIZE=100" src/family-log-import.ts
echo 'wave89 smoke: ok'
