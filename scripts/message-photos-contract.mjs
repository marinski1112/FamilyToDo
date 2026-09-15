import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'message-photos-'));
let createMessagePhoto,drainDeletedMessagePhotos;
try {
  execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noCheck','--target','ES2022','--module','ESNext','--outDir',temp,'src/message-photo-service.ts']);
  ({createMessagePhoto,drainDeletedMessagePhotos}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(join(temp,'message-photo-service.js'))).toString('base64')));
}finally{rmSync(temp,{recursive:true,force:true});}
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE messages(id INTEGER PRIMARY KEY,family_id INTEGER,sender_id INTEGER,target_member_id INTEGER,text TEXT,reminder_at TEXT,created_at TEXT,updated_at TEXT);`);
  sql.exec(readFileSync('migrations/0084_message_photos.sql','utf8'));
  const prepare=(query,values=[])=>({bind(...v){return prepare(query,v);},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:sql.prepare(query).run(...values)};}});
  let queue=Promise.resolve();const db={prepare,batch(statements){const run=queue.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}});queue=run.catch(()=>{});return run;}};
  const objects=new Map();const bucket={async put(key,bytes){objects.set(key,bytes);},async delete(key){objects.delete(key);}};
  const input={uploadId:crypto.randomUUID(),familyId:1,memberId:1,bytes:Uint8Array.from([255,216,255,1]).buffer,mime:'image/jpeg',caption:'写真',reminderAt:null,now:'2026-09-15 12:00:00'};
  return {sql,db,bucket,objects,input};
}
test('duplicate delivery after response loss returns the same message',async()=>{const f=fixture();try{const first=await createMessagePhoto(f.db,f.bucket,f.input);assert.equal(await createMessagePhoto(f.db,f.bucket,f.input),first);assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,1);assert.equal(f.objects.size,1);}finally{f.sql.close();}});
test('failed R2 upload keeps a durable retry identity without creating a message',async()=>{const f=fixture();try{await assert.rejects(createMessagePhoto(f.db,{...f.bucket,put:async()=>{throw new Error('R2');}},f.input));assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,0);assert.equal(f.sql.prepare('SELECT writers FROM message_photos').get().writers,0);assert.ok(await createMessagePhoto(f.db,f.bucket,f.input));}finally{f.sql.close();}});
test('rejects cross-family replay and changed bytes',async()=>{const f=fixture();try{await createMessagePhoto(f.db,f.bucket,f.input);await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,familyId:2}),/UPLOAD_CONFLICT/);await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,bytes:Uint8Array.from([255,216,255,2]).buffer}),/UPLOAD_CONFLICT/);}finally{f.sql.close();}});
test('message deletion retains cleanup state after failure and cannot resurrect on replay',async()=>{const f=fixture();try{await createMessagePhoto(f.db,f.bucket,f.input);f.sql.exec('DELETE FROM messages');await drainDeletedMessagePhotos(f.db,{...f.bucket,delete:async()=>{throw new Error('R2');}},1);assert.equal(f.objects.size,1);await drainDeletedMessagePhotos(f.db,f.bucket,1);assert.equal(f.objects.size,0);assert.equal(f.sql.prepare('SELECT state FROM message_photos').get().state,'deleted');await assert.rejects(createMessagePhoto(f.db,f.bucket,f.input));}finally{f.sql.close();}});
test('checks image size and signature before object writes',async()=>{const f=fixture();try{await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,bytes:new ArrayBuffer(4194305)}),/PHOTO_TOO_LARGE/);await assert.rejects(createMessagePhoto(f.db,f.bucket,{...f.input,bytes:new ArrayBuffer(10)}),/INVALID_IMAGE/);assert.equal(f.objects.size,0);}finally{f.sql.close();}});
test('parallel identical upload creates one destination',async()=>{const f=fixture();try{const ids=await Promise.all([createMessagePhoto(f.db,f.bucket,f.input),createMessagePhoto(f.db,f.bucket,f.input)]);assert.equal(ids[0],ids[1]);assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,1);}finally{f.sql.close();}});
test('a delayed duplicate write cannot recreate a deleted message or escape cleanup',async()=>{
  const f=fixture();let releaseFirst,releaseSecond,enteredFirst,enteredSecond;
  const firstEntered=new Promise(r=>{enteredFirst=r;}),secondEntered=new Promise(r=>{enteredSecond=r;});
  const firstGate=new Promise(r=>{releaseFirst=r;}),secondGate=new Promise(r=>{releaseSecond=r;});let count=0;
  const bucket={...f.bucket,async put(key,bytes){if(++count===1){enteredFirst();await firstGate;}else{enteredSecond();await secondGate;}await f.bucket.put(key,bytes);}};
  try {
    const first=createMessagePhoto(f.db,bucket,f.input);await firstEntered;
    const second=createMessagePhoto(f.db,bucket,f.input),failure=assert.rejects(second,/PHOTO_RETRY_REQUIRED/);
    await secondEntered;releaseFirst();await first;f.sql.exec('DELETE FROM messages');await drainDeletedMessagePhotos(f.db,bucket,1);assert.equal(f.objects.size,1);
    releaseSecond();await failure;assert.equal(f.objects.size,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,0);
  }finally{releaseFirst();releaseSecond();f.sql.close();}
});
