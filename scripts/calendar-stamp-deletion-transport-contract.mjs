import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const temp=mkdtempSync(join(tmpdir(),'stamp-deletion-transport-test-'));
let stampDeletionTransport;
try{
  execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),
    '--noCheck','--target','ES2022','--module','ESNext','--outDir',temp,
    'src/calendar-stamp-deletion-transport.ts']);
  ({stampDeletionTransport}=await import(
    `data:text/javascript;base64,${Buffer.from(readFileSync(join(temp,'calendar-stamp-deletion-transport.js'))).toString('base64')}`));
}finally{rmSync(temp,{recursive:true,force:true});}

const ok=()=>new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});

test('service-binding fetcher keeps auth and receives only portable request init',async()=>{
  let seenUrl='',seenInit;
  const fetcher=async(url,init)=>{seenUrl=String(url);seenInit=init;return ok();};
  const call=stampDeletionTransport({
    baseUrl:'https://family-shared-stamps.example',token:'family-token',fetcher,
  });
  assert.deepEqual(await call('/v1/stamps/deletion-catalog'),{ok:true});
  assert.equal(seenUrl,'https://family-shared-stamps.example/v1/stamps/deletion-catalog');
  assert.equal(seenInit.signal,undefined);
  assert.equal(seenInit.redirect,undefined);
  assert.equal(new Headers(seenInit.headers).get('authorization'),'Bearer family-token');
});

test('ordinary outbound fetch keeps redirect guard and bounded timeout signal',async()=>{
  const original=globalThis.fetch;
  let seenInit;
  globalThis.fetch=async(_url,init)=>{seenInit=init;return ok();};
  try{
    const call=stampDeletionTransport({baseUrl:'https://family-shared-stamps.example',token:'family-token'});
    assert.deepEqual(await call('/v1/stamps/deletion-catalog'),{ok:true});
    assert.equal(seenInit.redirect,'error');
    assert.ok(seenInit.signal instanceof AbortSignal);
    assert.equal(seenInit.signal.aborted,false);
  }finally{globalThis.fetch=original;}
});

test('non-success response reports only status for server diagnostics',async()=>{
  const fetcher=async()=>new Response(JSON.stringify({error:'hidden'}),{status:401});
  const call=stampDeletionTransport({
    baseUrl:'https://family-shared-stamps.example',token:'family-token',fetcher,
  });
  await assert.rejects(call('/v1/stamps/deletion-catalog'),/stamp deletion retry required \(401\)/);
});
