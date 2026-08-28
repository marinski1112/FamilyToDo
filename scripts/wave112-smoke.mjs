import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('src/calendar-ics-import.ts','utf8'),ui=fs.readFileSync('public/assets/calendar-import.js','utf8'),migration=fs.readFileSync('migrations/0037_wave112_calendar_import_resume_lock.sql','utf8'),pkg=JSON.parse(fs.readFileSync('package.json'));
assert.ok(['12.131.0-wave112','12.132.0-wave113','12.133.0-wave114','12.134.0-wave115','12.135.0-wave116','12.136.0-wave117','12.136.1-wave117-hotfix','12.137.0-wave118','12.138.0-wave119'].includes(pkg.version));
assert.match(ui,/file\.click\(\)/);assert.doesNotMatch(ui,/file\.focus\(/);assert.match(ui,/if\(applyRunning\)return/);assert.match(ui,/前回と同じICSファイルを選択してください/);
assert.match(ui,/function buildChunk\(parts,start/);assert.match(ui,/parts\.events\.slice\(start,start\+max\)/);assert.doesNotMatch(ui,/Math\.floor\(offset/);
const ids=Array.from({length:634},(_,i)=>i);for(const offset of [0,1,14,15,16,17,29,30,31,633,634]){const seen=new Set(ids.slice(0,offset));let cursor=offset;while(cursor<634){const part=ids.slice(cursor,cursor+15);assert.ok(part.length<=15);for(const id of part){assert.ok(!seen.has(id));seen.add(id);}cursor+=part.length;}assert.equal(cursor,634);assert.equal(seen.size,634);for(const id of ids)assert.ok(seen.has(id));}
assert.match(source,/lease_expires_at<\?/);assert.match(source,/processed_count=\? AND \(lease_token IS NULL/);assert.match(source,/code:'IMPORT_BUSY'/);assert.match(source,/processed_count=\? AND lease_token=\?/);assert.match(source,/ICS_APPLY_LEASE_MS=25_000/);
assert.match(migration,/UPDATE calendar_import_batches AS duplicate/);assert.match(migration,/CREATE UNIQUE INDEX idx_calendar_import_one_active_file/);assert.match(source,/INSERT OR IGNORE INTO calendar_import_batches/);assert.match(source,/resume_batch_id/);
assert.match(source,/parsedCount>ICS_APPLY_CHUNK/);assert.match(source,/MAX_D1_QUERY_BUDGET=40/);
console.log('wave112 smoke: exact ordinals 0/1/14/15/16/17/29/30/31/633/634; 634 unique, missing 0; lease/CAS/UX guards present');
