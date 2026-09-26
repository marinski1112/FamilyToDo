import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'familytodo-task-create-tombstone-'));
const db=path.join(dir,'fixture.sqlite');
const migration=fs.readFileSync('migrations/0095_task_create_tombstones.sql','utf8');
const idempotencySource=fs.readFileSync('src/task-create-idempotency.ts','utf8');
const indexSource=fs.readFileSync('src/index.ts','utf8');

const sqlite=(sql,{expectFailure=false}={})=>{
  const result=spawnSync('sqlite3',[db],{input:sql,encoding:'utf8'});
  if(expectFailure){
    assert.notEqual(result.status,0,`sqlite unexpectedly succeeded: ${sql}`);
    return String(result.stderr||'');
  }
  assert.equal(result.status,0,`sqlite failed: ${result.stderr}\nSQL: ${sql}`);
  return String(result.stdout||'').trim();
};

try{
  sqlite(`
CREATE TABLE families(id INTEGER PRIMARY KEY);
CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL);
CREATE TABLE tasks(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL,create_request_id INTEGER NULL);
CREATE TABLE task_create_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  task_id INTEGER NULL,
  status TEXT NOT NULL,
  lease_token TEXT NULL,
  lease_expires_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,member_id,scope,idempotency_key)
);
INSERT INTO families(id) VALUES(1);
INSERT INTO members(id,family_id) VALUES(1,1);
INSERT INTO tasks(id,family_id,create_request_id) VALUES(101,1,1);
INSERT INTO task_create_requests(id,family_id,member_id,scope,idempotency_key,request_hash,task_id,status,created_at,updated_at)
VALUES
 (1,1,1,'TASK_CREATE_V1','live-key-00000001','hash-live',101,'DONE','2026-01-01','2026-01-01'),
 (2,1,1,'TASK_CREATE_V1','gone-key-00000001','hash-gone',999,'DONE','2026-01-01','2026-01-01'),
 (3,1,1,'TASK_CREATE_V1','error-key-0000001','hash-error',NULL,'ERROR','2026-01-01','2026-01-01'),
 (4,1,1,'TASK_CREATE_V1','busy-key-00000001','hash-busy',NULL,'PROCESSING','2026-01-01','2026-01-01');
`);

  sqlite(migration);
  assert.equal(sqlite("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='task_create_tombstones'"),'1');
  assert.equal(sqlite("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='trg_task_create_requests_done_tombstone'"),'1');
  assert.equal(sqlite('SELECT COUNT(*) FROM task_create_tombstones'),'2','migration must backfill all completed requests');
  assert.equal(sqlite("SELECT task_id FROM task_create_tombstones WHERE idempotency_key='gone-key-00000001'"),'999','deleted-target tombstone must retain the original task id');

  sqlite(`
INSERT INTO tasks(id,family_id,create_request_id) VALUES(102,1,5);
INSERT INTO task_create_requests(id,family_id,member_id,scope,idempotency_key,request_hash,task_id,status,lease_token,lease_expires_at,created_at,updated_at)
VALUES(5,1,1,'TASK_CREATE_V1','new-key-0000000001','hash-new',NULL,'PROCESSING','lease','2099-01-01','2026-01-01','2026-01-01');
UPDATE task_create_requests SET status='DONE',task_id=102,lease_token=NULL,lease_expires_at=NULL WHERE id=5;
`);
  assert.equal(sqlite("SELECT task_id FROM task_create_tombstones WHERE idempotency_key='new-key-0000000001'"),'102','DONE transition must create a durable tombstone');

  const triggerBody=migration.slice(migration.indexOf('CREATE TRIGGER'));
  assert.match(triggerBody,/INSERT INTO task_create_tombstones\s*\(/,'trigger must use a strict insert');
  assert.doesNotMatch(triggerBody,/INSERT\s+OR\s+(?:IGNORE|REPLACE)/i,'trigger must not hide tombstone conflicts');
  sqlite("UPDATE task_create_requests SET status='DONE',request_hash='different-hash' WHERE id=5",{expectFailure:true});
  assert.equal(sqlite('SELECT request_hash FROM task_create_requests WHERE id=5'),'hash-new','conflicting tombstone write must abort the source update');

  const durableRead=idempotencySource.indexOf('const durable = await readTombstone');
  const operationalInsert=idempotencySource.indexOf('INSERT OR IGNORE INTO task_create_requests');
  assert.ok(durableRead>=0 && operationalInsert>durableRead,'durable tombstone must be checked before a new operational claim is inserted');
  assert.match(idempotencySource,/function tombstoneClaim[\s\S]*?request_hash\) !== requestHash[\s\S]*?state: 'CONFLICT'/,'tombstone hash mismatch must remain a conflict');
  assert.match(idempotencySource,/function tombstoneClaim[\s\S]*?task_exists[\s\S]*?state: 'REPLAY'[\s\S]*?state: 'GONE'/,'tombstone must distinguish live replay from a deleted target');
  assert.match(idempotencySource,/readCompletedTaskCreate[\s\S]*?FROM task_create_tombstones/,'post-create read must survive operational row cleanup');
  assert.match(indexSource,/run\('task_claim_cleanup',observed=>cleanupCompletedTaskCreateRequests\(observed\.DB\)\)/,'hourly cleanup must invoke bounded completed-row pruning');

  const cleanupMatch=idempotencySource.match(/DELETE FROM task_create_requests[\s\S]*?ORDER BY r\.id\s+LIMIT \?\s+\)/);
  assert.ok(cleanupMatch,'bounded completed-row cleanup SQL must remain present');
  assert.match(cleanupMatch[0],/JOIN task_create_tombstones d/,'cleanup must require a matching durable tombstone');
  assert.match(cleanupMatch[0],/d\.request_hash=r\.request_hash AND d\.task_id=r\.task_id/,'cleanup must verify hash and task target before deleting the operational row');
  assert.doesNotMatch(cleanupMatch[0],/(?:created_at|updated_at)\s*</i,'cleanup must not invent an age-based TTL');

  sqlite(cleanupMatch[0].replace('LIMIT ?','LIMIT 2'));
  assert.equal(sqlite("SELECT group_concat(id,',') FROM (SELECT id FROM task_create_requests ORDER BY id)"),'3,4,5','only bounded, tombstoned DONE rows may be pruned');
  assert.equal(sqlite('SELECT COUNT(*) FROM task_create_tombstones'),'3','durable replay/GONE records must survive operational cleanup');
  assert.equal(sqlite('SELECT COUNT(*) FROM tasks WHERE id IN (101,102)'),'2','cleanup must not delete target tasks');

  console.log('Task create tombstone contract OK: durable replay/GONE semantics survive bounded DONE-row cleanup');
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
