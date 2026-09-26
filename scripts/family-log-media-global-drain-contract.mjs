import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

const load=async(path,replacement)=>{
  let source=readFileSync(path,'utf8');
  for(const [from,to] of replacement)source=source.replace(from,to);
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const {drainFamilyLogMediaGlobal}=await load('src/family-log-media-api.ts',[["import {json} from './response';",'const json=(value:unknown)=>Response.json(value);']]);
const {familyLogMediaCleanupAdmin}=await load('src/family-log-media-cleanup-admin.ts',[["import {bodyJson} from './request-body';",'const bodyJson=(request:Request)=>request.json();']]);
const sql=new DatabaseSync(':memory:');
sql.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE families(id INTEGER PRIMARY KEY);
  CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER);
  CREATE TABLE family_logs(id INTEGER PRIMARY KEY,family_id INTEGER,subject_id INTEGER,deleted_at TEXT,log_type TEXT,detail_code TEXT);
  CREATE TABLE family_log_subjects(id INTEGER PRIMARY KEY,family_id INTEGER,subject_kind TEXT);
  CREATE TABLE family_log_journal_entries(log_id INTEGER,family_id INTEGER,subject_id INTEGER,journal_kind TEXT,entry_kind TEXT);
  CREATE TABLE family_log_media(id INTEGER PRIMARY KEY,family_id INTEGER,log_id INTEGER,subject_id INTEGER,storage_key TEXT UNIQUE,mime_type TEXT,byte_size INTEGER,reconcile_pending INTEGER);
  CREATE TABLE family_log_media_cleanup_queue(id INTEGER PRIMARY KEY,family_id INTEGER,storage_key TEXT UNIQUE,purpose TEXT,created_at TEXT,attempts INTEGER DEFAULT 0,last_attempt_at TEXT);
  INSERT INTO families VALUES(1),(2),(3); INSERT INTO members VALUES(1,1),(2,1);`);
sql.exec(readFileSync('migrations/0111_family_log_media_cleanup_lifecycle.sql','utf8'));
const db={prepare(query){const stmt=sql.prepare(query);const bound=(args=[])=>({bind(...next){return bound(next);},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:{changes:stmt.run(...args).changes}};}});return bound();}};
const deleted=[],fail=new Set(['bad']);
const env={DB:db,MEDIA:{async delete(key){deleted.push(key);if(fail.has(key))throw new Error('R2 unavailable');}}};
const old='2026-01-01T00:00:00.000Z';
const insert=sql.prepare('INSERT INTO family_log_media_cleanup_queue(family_id,storage_key,purpose,created_at) VALUES(?,?,?,?)');
insert.run(1,'bad','DELETE',old);
for(let i=2;i<=70;i++)insert.run(1,`family1-${i}`,'DELETE',old);
insert.run(2,'family2','DELETE',old);insert.run(3,'family3','DELETE',old);
await drainFamilyLogMediaGlobal(env);
assert.equal(sql.prepare("SELECT attempts FROM family_log_media_cleanup_queue WHERE storage_key='bad'").get().attempts,1);
assert.ok(sql.prepare("SELECT next_attempt_at FROM family_log_media_cleanup_queue WHERE storage_key='bad'").get().next_attempt_at>new Date().toISOString());
assert.equal(deleted.length,1,'first run has a finite per-family R2 budget');
await drainFamilyLogMediaGlobal(env);
assert.ok(deleted.includes('family2')&&deleted.includes('family3'),'other families progress despite the failed first row and >batch backlog');
assert.equal(deleted.filter(key=>key==='bad').length,1,'backoff prevents an immediate retry');
assert.equal(sql.prepare("SELECT count(*) n FROM family_log_media_cleanup_queue WHERE family_id IN (2,3)").get().n,0);

// Accelerate the clock for the permanent failure without waiting for real backoff.
sql.exec("DELETE FROM family_log_media_cleanup_queue WHERE storage_key<>'bad' AND family_id=1;");
for(let i=1;i<8;i++){
  sql.exec("UPDATE family_log_media_cleanup_queue SET next_attempt_at='2026-01-01T00:00:00.000Z' WHERE storage_key='bad'");
  await drainFamilyLogMediaGlobal(env);
}
assert.equal(sql.prepare("SELECT status FROM family_log_media_cleanup_queue WHERE storage_key='bad'").get().status,'DEAD');
const attempts=deleted.filter(key=>key==='bad').length;
await drainFamilyLogMediaGlobal(env);
assert.equal(deleted.filter(key=>key==='bad').length,attempts,'DEAD rows do not retry automatically');
const admin=id=>({member:{id,role:'ADMIN',family_id:1},session:{csrfToken:'secret'},env});
const request=(method,body)=>new Request('https://familytodo.test/api/family-log-media-cleanup-admin',{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
assert.equal((await familyLogMediaCleanupAdmin(request('POST',{csrf:'secret',id:1}),{...admin(2),member:{id:2,role:'MEMBER',family_id:1}})).status,403);
assert.equal((await familyLogMediaCleanupAdmin(request('POST',{csrf:'wrong',id:1}),admin(1))).status,403);
const otherFamily={...admin(1),member:{id:4,role:'ADMIN',family_id:2}};
assert.equal((await familyLogMediaCleanupAdmin(request('POST',{csrf:'secret',id:1}),otherFamily)).status,404);
const dead=await (await familyLogMediaCleanupAdmin(request('GET'),admin(1))).json();
assert.equal(dead.dead[0].id,1);assert.ok(!JSON.stringify(dead).includes('storage_key'));
assert.equal((await familyLogMediaCleanupAdmin(request('POST',{csrf:'secret',id:1}),admin(1))).status,200);
fail.delete('bad');await drainFamilyLogMediaGlobal(env);
assert.equal(sql.prepare("SELECT count(*) n FROM family_log_media_cleanup_queue WHERE storage_key='bad'").get().n,0);

insert.run(1,'fresh','ORPHAN',new Date().toISOString());
insert.run(1,'linked','ORPHAN',old);
sql.exec("INSERT INTO family_log_media VALUES(1,1,1,1,'linked','image/jpeg',1,0)");
await drainFamilyLogMediaGlobal(env);
await drainFamilyLogMediaGlobal(env);
assert.ok(!deleted.includes('fresh'),'fresh ORPHAN retains the upload grace');
assert.ok(!deleted.includes('linked'),'linked ORPHAN never deletes the valid R2 object');
assert.equal(sql.prepare("SELECT count(*) n FROM family_log_media_cleanup_queue WHERE storage_key='linked'").get().n,0);
sql.exec("UPDATE family_log_media_cleanup_queue SET created_at='2026-01-01T00:00:00.000Z' WHERE storage_key='fresh'");
await drainFamilyLogMediaGlobal(env);await drainFamilyLogMediaGlobal(env);
assert.ok(deleted.includes('fresh'),'aged orphan is eventually drained');

sql.exec("INSERT INTO family_log_subjects VALUES(1,1,'BABY'); INSERT INTO family_logs VALUES(2,1,1,NULL,'MEAL','BABY_FOOD'); INSERT INTO family_log_media VALUES(2,1,2,1,'valid','image/jpeg',1,1)");
await drainFamilyLogMediaGlobal(env);
assert.equal(sql.prepare("SELECT reconcile_pending FROM family_log_media WHERE id=2").get().reconcile_pending,0);
sql.exec("INSERT INTO family_logs VALUES(3,1,1,'2026-01-01','MEAL','BABY_FOOD'); INSERT INTO family_log_media VALUES(3,1,3,1,'delete-media','image/jpeg',1,1)");
await drainFamilyLogMediaGlobal(env);await drainFamilyLogMediaGlobal(env);
assert.ok(deleted.includes('delete-media'));
assert.equal(sql.prepare("SELECT count(*) n FROM family_log_media WHERE id=3").get().n,0,'DELETE removes metadata after R2 cleanup');
sql.close();
assert.match(readFileSync('src/index.ts','utf8'),/run\('family_log_media_cleanup',drainFamilyLogMediaGlobal\)/);
assert.match(readFileSync('src/settings-root.ts','utf8'),/mediaCleanupRecovery/);
execFileSync(process.execPath,['--check','public/assets/settings-media-cleanup.js']);
console.log('Family Log media: bounded global fairness, backlog, backoff/dead/recovery, orphan grace/link and reconciliation OK');
