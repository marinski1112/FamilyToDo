import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/assets/family-log-import.js','utf8');
const status={textContent:''};
const repair={dataset:{id:'98'},listeners:{},addEventListener(k,v){this.listeners[k]=v}};
const elements={
  familyLogImportPayload:{textContent:JSON.stringify({csrf:'token',subjects:{},types:{},maxBytes:100})},
  importFile:{files:[]},importSubject:{value:''},importStatus:status,
  importPreviewOut:{replaceChildren(){},appendChild(){}},importPreview:{},
};
let request;
const document={
  getElementById:id=>elements[id],
  querySelectorAll:s=>s==='.import-time-repair'?[repair]:[],
  createElement:()=>({append(){},appendChild(){}}),
};
const fetch=async(_url,options)=>{
  request=JSON.parse(options.body);
  return {ok:true,json:async()=>({ok:true,total_count:1,target_count:0,skipped_edited_count:1,offset_minutes:540,timezone:'Asia/Tokyo',samples:[]})};
};
vm.runInNewContext(source,{document,fetch,confirm:()=>false,alert(){},location:{reload(){}},setTimeout,URL,console});
assert.equal(typeof repair.listeners.click,'function','repair click listener must be registered');
await repair.listeners.click();
assert.equal(request.action,'repair_preview','repair click must post repair_preview through the scoped import call');
assert.match(status.textContent,/対象はありません/,'empty repair preview must present the no-target status');

console.log('family-log-import-repair-contract: scoped repair preview interaction and empty-result status ok');
