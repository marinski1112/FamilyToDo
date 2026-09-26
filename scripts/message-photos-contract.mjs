import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'message-photos-'));
let createMessagePhoto,drainDeletedMessagePhotos,drainDeletedMessagePhotosGlobal;
try {
  execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noCheck','--target','ES2022','--module','ESNext','--outDir',temp,'src/message-photo-service.ts']);
  ({createMessagePhoto,drainDeletedMessagePhotos,drainDeletedMessagePhotosGlobal}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(join(temp,'message-photo-service.js'))).toString('base64')));
}finally{rmSync(temp,{recursive:true,force:true});}
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE messages(id INTEGER PRIMARY KEY,family_id INTEGER,sender_id INTEGER,target_member_id INTEGER,text TEXT,reminder_at TEXT,created_at TEXT,updated_at TEXT);`);
  sql.exec(readFileSync('migrations/0084_message_photos.sql','utf8'));
  sql.exec(readFileSync('migrations/0092_message_photo_global_cleanup.sql','utf8'));
  sql.exec(`CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER,active INTEGER);INSERT INTO members VALUES(1,1,1),(2,1,1),(3,2,1);
    CREATE TABLE notifications(family_id INTEGER,member_id INTEGER,type TEXT,target_type TEXT,target_id INTEGER,notify_at TEXT,status TEXT,message TEXT,created_at TEXT);`);
  const prepare=(query,values=[])=>({bind(...v){return prepare(query,v);},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:sql.prepare(query).run(...values)};}});
  let queue=Promise.resolve();const db={prepare,batch(statements){const run=queue.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}});queue=run.catch(()=>{});return run;}};
  const objects=new Map(),metadata=new Map();const bucket={async put(key,bytes,options={}){objects.set(key,bytes);metadata.set(key,options.customMetadata||{});},async delete(key){objects.delete(key);metadata.delete(key);}};
  const input={uploadId:crypto.randomUUID(),familyId:1,memberId:1,bytes:Uint8Array.from([255,216,255,1]).buffer,mime:'image/jpeg',caption:'写真',reminderAt:null,sourceSha256:'a'.repeat(64),now:'2026-09-15 12:00:00'};
  return {sql,db,bucket,objects,metadata,input};
}
test('duplicate delivery after response loss returns the same message',async()=>{const f=fixture();try{const first=await createMessagePhoto(f.db,f.bucket,f.input);assert.equal(await createMessagePhoto(f.db,f.bucket,f.input),first);assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,1);assert.equal(f.objects.size,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM notifications').get().n,1);}finally{f.sql.close();}});
test('stores original source hash in R2 custom metadata without changing normalized D1 hash semantics',async()=>{const f=fixture();try{await createMessagePhoto(f.db,f.bucket,f.input);const row=f.sql.prepare('SELECT object_key,sha256 FROM message_photos').get();assert.equal(f.metadata.get(row.object_key).sourceSha256,f.input.sourceSha256);assert.notEqual(row.sha256,f.input.sourceSha256);}finally{f.sql.close();}});
test('rejects malformed original source hash before object writes',async()=>{const f=fixture();try{await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,sourceSha256:'bad'}),/INVALID_PHOTO/);assert.equal(f.objects.size,0);}finally{f.sql.close();}});
test('failed R2 upload keeps a durable retry identity without creating a message',async()=>{const f=fixture();try{await assert.rejects(createMessagePhoto(f.db,{...f.bucket,put:async()=>{throw new Error('R2');}},f.input));assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,0);assert.equal(f.sql.prepare('SELECT writers FROM message_photos').get().writers,0);assert.ok(await createMessagePhoto(f.db,f.bucket,f.input));}finally{f.sql.close();}});
test('rejects cross-family replay and changed bytes',async()=>{const f=fixture();try{await createMessagePhoto(f.db,f.bucket,f.input);await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,familyId:2}),/UPLOAD_CONFLICT/);await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,bytes:Uint8Array.from([255,216,255,2]).buffer}),/UPLOAD_CONFLICT/);}finally{f.sql.close();}});
test('message deletion retains cleanup state after failure and cannot resurrect on replay',async()=>{const f=fixture();try{await createMessagePhoto(f.db,f.bucket,f.input);f.sql.exec('DELETE FROM messages');await drainDeletedMessagePhotos(f.db,{...f.bucket,delete:async()=>{throw new Error('R2');}},1);assert.equal(f.objects.size,1);await drainDeletedMessagePhotos(f.db,f.bucket,1);assert.equal(f.objects.size,0);assert.equal(f.sql.prepare('SELECT state FROM message_photos').get().state,'deleted');await assert.rejects(createMessagePhoto(f.db,f.bucket,f.input));}finally{f.sql.close();}});
test('global cleanup query is indexed, bounded and skips active writers',async()=>{
  const f=fixture();try{
    const plan=f.sql.prepare("EXPLAIN QUERY PLAN SELECT upload_id,family_id,object_key FROM message_photos WHERE state='delete_pending' AND writers=0 ORDER BY created_at,upload_id LIMIT 24").all().map(row=>String(row.detail||'')).join(' ');
    assert.match(plan,/idx_message_photos_global_cleanup/);
    const insert=f.sql.prepare("INSERT INTO message_photos(upload_id,family_id,member_id,object_key,sha256,mime_type,byte_size,caption,reminder_at,state,writers,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    for(let i=0;i<26;i++){
      const familyId=i%2===0?1:2,memberId=familyId===1?1:3,uploadId=crypto.randomUUID(),objectKey=`families/${familyId}/message-photos/${uploadId}`;
      insert.run(uploadId,familyId,memberId,objectKey,'a'.repeat(64),'image/jpeg',4,'pending',null,'delete_pending',0,`2026-09-15 12:00:${String(i).padStart(2,'0')}`);
      f.objects.set(objectKey,new ArrayBuffer(4));
    }
    const activeUploadId=crypto.randomUUID(),activeObjectKey=`families/1/message-photos/${activeUploadId}`;
    insert.run(activeUploadId,1,1,activeObjectKey,'b'.repeat(64),'image/jpeg',4,'active',null,'delete_pending',1,'2026-09-15 11:59:59');
    f.objects.set(activeObjectKey,new ArrayBuffer(4));
    await drainDeletedMessagePhotosGlobal(f.db,f.bucket);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM message_photos WHERE state='deleted'").get().n,24);
    assert.equal(f.sql.prepare("SELECT state FROM message_photos WHERE upload_id=?").get(activeUploadId).state,'delete_pending');
    assert.equal(f.objects.size,3);
    await drainDeletedMessagePhotosGlobal(f.db,f.bucket);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM message_photos WHERE state='deleted'").get().n,26);
    assert.equal(f.objects.size,1);
  }finally{f.sql.close();}
});
const workerSource=readFileSync('src/index.ts','utf8');
assert.ok(workerSource.includes("import {drainDeletedMessagePhotosGlobal} from './message-photo-service';"),'scheduled worker must import global message photo cleanup');
assert.ok(workerSource.includes(`run('message_photo_cleanup',observed=>drainDeletedMessagePhotosGlobal(observed.DB,observed.MEDIA));`),'hourly cleanup must schedule bounded global message photo cleanup');

test('checks image size and signature before object writes',async()=>{const f=fixture();try{await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,bytes:new ArrayBuffer(4194305)}),/PHOTO_TOO_LARGE/);await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,bytes:new ArrayBuffer(10)}),/INVALID_IMAGE/);assert.equal(f.objects.size,0);}finally{f.sql.close();}});
test('parallel identical upload creates one destination',async()=>{const f=fixture();try{const ids=await Promise.all([createMessagePhoto(f.db,f.bucket,f.input),createMessagePhoto(f.db,f.bucket,f.input)]);assert.equal(ids[0],ids[1]);assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,1);}finally{f.sql.close();}});
test('a delayed duplicate write cannot recreate a deleted message or escape cleanup',async()=>{
  const f=fixture();let releaseFirst,releaseSecond,enteredFirst,enteredSecond;
  const firstEntered=new Promise(r=>{enteredFirst=r;}),secondEntered=new Promise(r=>{enteredSecond=r;});
  const firstGate=new Promise(r=>{releaseFirst=r;}),secondGate=new Promise(r=>{releaseSecond=r;});let count=0;
  const bucket={...f.bucket,async put(key,bytes,options){if(++count===1){enteredFirst();await firstGate;}else{enteredSecond();await secondGate;}await f.bucket.put(key,bytes,options);}};
  try {
    const first=createMessagePhoto(f.db,bucket,f.input);await firstEntered;
    const second=createMessagePhoto(f.db,bucket,f.input),failure=assert.rejects(second,/PHOTO_RETRY_REQUIRED/);
    await secondEntered;releaseFirst();await first;f.sql.exec('DELETE FROM messages');await drainDeletedMessagePhotos(f.db,bucket,1);assert.equal(f.objects.size,1);
    releaseSecond();await failure;assert.equal(f.objects.size,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,0);
  }finally{releaseFirst();releaseSecond();f.sql.close();}
});
