import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'photo-transfers-'));let createPhotoTransfer,claimPhotoTransfer;
try{execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noCheck','--target','ES2022','--module','ESNext','--outDir',temp,'src/photo-transfer-service.ts']);({createPhotoTransfer,claimPhotoTransfer}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(join(temp,'photo-transfer-service.js'))).toString('base64')));}finally{rmSync(temp,{recursive:true,force:true});}
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('migrations/0087_photo_transfers.sql','utf8'));const prepare=(q,v=[])=>({bind(...a){return prepare(q,a);},async first(){return sql.prepare(q).get(...v)||null;},async run(){return sql.prepare(q).run(...v);}});return {sql,db:{prepare}};}
const input={familyId:1,memberId:2,kind:'message',id:3,caption:'確認したひとこと'};
test('capability stores digest and binds exact source',async()=>{const {sql,db}=fixture();try{const token=await createPhotoTransfer(db,input,100);assert.notEqual(sql.prepare('SELECT token_hash FROM photo_transfers').get().token_hash,token);assert.deepEqual({...await claimPhotoTransfer(db,token,101)},{family_id:1,member_id:2,source_kind:'message',source_id:3,caption:input.caption});assert.equal(await claimPhotoTransfer(db,'0'.repeat(64),101),null);}finally{sql.close();}});
test('parallel redemptions share bounded retry budget',async()=>{const {sql,db}=fixture();try{const token=await createPhotoTransfer(db,input,100);const rows=await Promise.all(Array.from({length:6},()=>claimPhotoTransfer(db,token,101)));assert.equal(rows.filter(Boolean).length,3);assert.equal(sql.prepare('SELECT remaining_reads n FROM photo_transfers').get().n,0);}finally{sql.close();}});
test('expiry boundary and malformed token deny; expired record cleaned',async()=>{const {sql,db}=fixture();try{const token=await createPhotoTransfer(db,input,100);assert.equal(await claimPhotoTransfer(db,token,400),null);assert.equal(await claimPhotoTransfer(db,'invalid',100),null);await createPhotoTransfer(db,{...input,kind:'journal'},400);assert.equal(sql.prepare('SELECT count(*) n FROM photo_transfers').get().n,1);}finally{sql.close();}});
