import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/assets/family-log-import-piyolog.js','utf8');
const fn=source.slice(source.indexOf('async function prepareImportPhoto'),source.indexOf('async function uploadPhoto'));
let revoked=0,canvas,decodeFailure=false,encodeFailure=false;
class ImageMock{naturalWidth=2400;naturalHeight=1600;set src(v){if(v)queueMicrotask(()=>decodeFailure?this.onerror?.():this.onload?.());}}
const context={Image:ImageMock,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL:()=>revoked++},setTimeout,clearTimeout,MAX_IMAGE_BYTES:4*1024*1024,mediaError:(stage,code,http,message)=>Object.assign(new Error(message),{stage,code}),document:{createElement:()=>canvas={getContext:()=>({fillRect(){},drawImage(){}}),toBlob(cb,type){cb(encodeFailure?null:{type,size:1000});}}}};
vm.createContext(context);vm.runInContext(fn+';globalThis.prepare=prepareImportPhoto;',context);
const blob=await context.prepare({size:6*1024*1024});
assert.equal(blob.type,'image/jpeg');assert.equal(canvas.width,800);assert.equal(canvas.height,533);assert.equal(revoked,1);
await assert.rejects(()=>context.prepare({size:21*1024*1024}),e=>e.code==='SOURCE_TOO_LARGE');
decodeFailure=true;await assert.rejects(()=>context.prepare({size:100}),e=>e.code==='DECODE_FAILED');assert.equal(revoked,2);
decodeFailure=false;encodeFailure=true;await assert.rejects(()=>context.prepare({size:100}),e=>e.code==='ENCODE_FAILED');assert.equal(revoked,3);
assert.match(source,/body:blob,signal:controller.signal/);
assert.match(source,/mediaCode==='UPLOAD_TIMEOUT'/);
assert.match(source,/if\(recordsById.has\(id\)\)/);
console.log('import photo preparation: large source resize, decode/encode failure cleanup, bounded output pass');
