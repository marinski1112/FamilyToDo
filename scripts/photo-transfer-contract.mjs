import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'photo-transfers-'));let createPhotoTransfer,claimPhotoTransfer,cleanupExpiredPhotoTransfers;
try{execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noCheck','--target','ES2022','--module','ESNext','--outDir',temp,'src/photo-transfer-service.ts']);({createPhotoTransfer,claimPhotoTransfer,cleanupExpiredPhotoTransfers}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(join(temp,'photo-transfer-service.js'))).toString('base64')));}finally{rmSync(temp,{recursive:true,force:true});}
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('migrations/0087_photo_transfers.sql','utf8'));const prepare=(q,v=[])=>({bind(...a){return prepare(q,a);},async first(){return sql.prepare(q).get(...v)||null;},async run(){return {meta:sql.prepare(q).run(...v)};}});return {sql,db:{prepare}};}
const input={familyId:1,memberId:2,kind:'message',id:3,caption:'確認したひとこと',sha256:'f'.repeat(64)};
test('capability stores digest and binds exact source',async()=>{const {sql,db}=fixture();try{const token=await createPhotoTransfer(db,input,100);assert.notEqual(sql.prepare('SELECT token_hash FROM photo_transfers').get().token_hash,token);assert.deepEqual({...await claimPhotoTransfer(db,token,101)},{family_id:1,member_id:2,source_kind:'message',source_id:3,caption:input.caption,sha256:input.sha256});assert.equal(await claimPhotoTransfer(db,'0'.repeat(64),101),null);}finally{sql.close();}});
test('parallel redemptions share bounded retry budget',async()=>{const {sql,db}=fixture();try{const token=await createPhotoTransfer(db,input,100);const rows=await Promise.all(Array.from({length:6},()=>claimPhotoTransfer(db,token,101)));assert.equal(rows.filter(Boolean).length,3);assert.equal(sql.prepare('SELECT remaining_reads n FROM photo_transfers').get().n,0);}finally{sql.close();}});
test('expiry boundary and malformed token deny; expired record cleaned',async()=>{const {sql,db}=fixture();try{const token=await createPhotoTransfer(db,input,100);assert.equal(await claimPhotoTransfer(db,token,400),null);assert.equal(await claimPhotoTransfer(db,'invalid',100),null);await createPhotoTransfer(db,{...input,kind:'journal'},400);assert.equal(sql.prepare('SELECT count(*) n FROM photo_transfers').get().n,1);}finally{sql.close();}});

test('scheduled cleanup removes expired transfers without requiring a new mint and stays bounded',async()=>{const {sql,db}=fixture();try{
 const insert=sql.prepare("INSERT INTO photo_transfers(token_hash,family_id,member_id,source_kind,source_id,caption,sha256,expires_at,remaining_reads) VALUES(?,?,?,?,?,?,?,?,?)");
 for(let i=0;i<105;i++)insert.run(i.toString(16).padStart(64,'0'),1,2,'message',3,'x','f'.repeat(64),100,0);
 insert.run('f'.repeat(63)+'e',1,2,'message',3,'active','f'.repeat(64),401,1);
 assert.equal(await cleanupExpiredPhotoTransfers(db,400),100);
 assert.equal(sql.prepare('SELECT count(*) n FROM photo_transfers WHERE expires_at<=400').get().n,5);
 assert.equal(await cleanupExpiredPhotoTransfers(db,400),5);
 assert.equal(sql.prepare('SELECT count(*) n FROM photo_transfers').get().n,1);
 assert.equal(sql.prepare('SELECT caption FROM photo_transfers').get().caption,'active');
}finally{sql.close();}});
const scheduledIndex=readFileSync('src/index.ts','utf8');
assert.ok(scheduledIndex.includes("import {cleanupExpiredPhotoTransfers} from './photo-transfer-service';"),'scheduled cleanup must use the canonical photo-transfer service');
const hourlyPos=scheduledIndex.indexOf('if(plan.hourlyCleanup){');
const cleanupPos=scheduledIndex.indexOf(`run('photo_transfer_cleanup',observed=>cleanupExpiredPhotoTransfers(observed.DB));`,hourlyPos);
assert.ok(hourlyPos>=0&&cleanupPos>hourlyPos,'expired photo transfers must be drained by the existing hourly cleanup slot');
