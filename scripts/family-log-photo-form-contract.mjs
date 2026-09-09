import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const asset=fs.readFileSync('public/assets/family-log-baby-food-media.js','utf8');
const core=fs.readFileSync('public/assets/family-log-core.js','utf8');
assert.ok(core.includes("logForm?.dispatchEvent(new Event('family-log-fields-ready'))"));
assert.ok(!asset.includes('queueMicrotask(()=>queueMicrotask(sync))'),'no click/microtask guessing');
function fixture(journalPhotos=false){
  class El{
    constructor(){this.listeners={};this.children=[];this.hidden=false;this.value='';this.disabled=false;this.style={};this.classList={add(){},remove(){}};}
    addEventListener(type,fn){this.listeners[type]=fn;}
    setAttribute(){}removeAttribute(){}insertAdjacentElement(){}
    append(...nodes){this.children.push(...nodes);}appendChild(node){this.append(node);}
    set innerHTML(value){this.children=[];}get innerHTML(){return '';}
    querySelector(selector){return nodes[selector]||new El();}
  }
  class Form extends El{}
  const form=new Form(),submit=new El(),preview=new El(),picker=new El(),input=new El(),camera=new El(),status=new El();
  const nodes={'#familyLogMediaPreview':preview,'#familyLogMediaPicker':picker,'#familyLogMediaInput':input,'#familyLogMediaCamera':camera,'#familyLogMediaStatus':status,'button[type="submit"]':submit};
  const fields=Object.fromEntries(['id','subject_id','log_type','detail_code','occurred_at'].map(k=>[k,{value:''}]));
  Object.assign(fields.subject_id,{value:'1'});fields.log_type.value='MEAL';fields.occurred_at.value='2026-09-09T12:00';
  form.elements={namedItem:k=>fields[k]||null};
  let wrap,decodeResolve,uploads=0,logs=0,reloads=0,failUpload=true;
  const listeners={},doc={getElementById(id){return id==='familyLogPayload'?{textContent:JSON.stringify({csrf:'SECRET',logs:{},journalPhotos,journalLogIds:[12]})}:id==='familyLogForm'?form:id==='familyLogAdvanced'?new El():null;},head:new El(),body:new El(),querySelector:()=>null,addEventListener(type,fn){listeners[type]=fn;},createElement(tag){const el=new El();if(tag==='section')wrap=el;if(tag==='canvas'){el.getContext=()=>({drawImage(){}});el.toBlob=cb=>cb({size:100,type:'image/jpeg'});}return el;}};
  const sandbox={document:doc,HTMLFormElement:Form,HTMLSelectElement:El,Element:El,Map,Set,JSON,Number,String,Object,Array,Promise,
    URL:{createObjectURL:()=> 'blob:local-photo',revokeObjectURL(){}},
    createImageBitmap:()=>new Promise(resolve=>{decodeResolve=resolve;}),
    FormData:class{constructor(){this.values=Object.entries(fields).map(([k,v])=>[k,v.value]);}get(k){return this.values.find(x=>x[0]===k)?.[1]||'';}entries(){return this.values[Symbol.iterator]();}},
    location:{reload(){reloads++;}},alert(){},confirm:()=>true,addEventListener(){},
    fetch:async(url,options={})=>{
      if(url==='/api/family-log'){logs++;return {ok:true,json:async()=>({ok:true,id:12})};}
      if(options.method==='POST'){uploads++;assert.equal(options.headers['x-family-log-id'],'12');assert.equal(options.headers['x-csrf-token'],'SECRET');return {ok:!failUpload,status:failUpload?503:201,json:async()=>({ok:!failUpload,media:{id:1}})};}
      return {ok:true,json:async()=>({ok:true,media:null})};
    }};
  sandbox.window=sandbox;vm.runInNewContext(asset,sandbox);
  const event=()=>({target:form,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
  return {form,fields,submit,preview,status,input,camera,get wrap(){return wrap;},get logs(){return logs;},get uploads(){return uploads;},get reloads(){return reloads;},
    ready(){return form.listeners['family-log-fields-ready']();},reset(){form.listeners.reset();},
    select(){input.files=[{size:100}];return input.listeners.change({currentTarget:input});},
    decode(){decodeResolve({width:100,height:100,close(){}});},
    async save(){const e=event();await listeners.submit(e);return e;},succeed(){failUpload=false;}};
}
const f=fixture();assert.equal(f.wrap.hidden,true);f.fields.detail_code.value='BABY_FOOD';await f.ready();assert.equal(f.wrap.hidden,false,'first explicit field update must reveal photo UI');
const selecting=f.select();assert.equal(f.submit.disabled,true);const preparingSave=await f.save();assert.equal(preparingSave.stopped,true);assert.equal(f.logs,0,'photo preparation cannot fall through to text-only core save');
f.decode();await selecting;assert.equal(f.submit.disabled,false);assert.ok(f.status.textContent.includes('保存する'));assert.equal(f.preview.children.length,2);
await f.save();assert.equal(f.logs,1);assert.equal(f.uploads,1);assert.equal(f.fields.id.value,'12');assert.ok(f.status.textContent.includes('保存済み'));assert.ok(f.status.textContent.includes('503'));assert.equal(f.submit.disabled,false);
f.succeed();await f.save();assert.equal(f.logs,1,'photo retry must not re-save canonical log');assert.equal(f.uploads,2);assert.equal(f.reloads,1);
const concurrent=fixture();concurrent.fields.detail_code.value='BABY_FOOD';await concurrent.ready();const selection=concurrent.select();concurrent.decode();await selection;concurrent.succeed();await Promise.all([concurrent.save(),concurrent.save()]);assert.equal(concurrent.logs,1);assert.equal(concurrent.uploads,1,'repeated submit must not send twice');
const switched=fixture();switched.fields.detail_code.value='BABY_FOOD';await switched.ready();const oldSelection=switched.select();switched.reset();switched.fields.subject_id.value='2';await switched.ready();switched.decode();await oldSelection;
assert.equal(switched.preview.children.length,0,'late decode cannot attach a previous draft photo');assert.equal((await switched.save()).stopped,undefined);assert.equal(switched.logs,0);
const detail=fixture();detail.fields.detail_code.value='BABY_FOOD';await detail.ready();assert.equal(detail.wrap.hidden,false);detail.fields.detail_code.value='BREAKFAST';await detail.ready();assert.equal(detail.wrap.hidden,true,'only eligible BABY_FOOD flow attaches photos');
console.log('photo form: first-open, explicit state, prep/save exclusion, upload-only retry and stale decode isolation ok');

const journal=fixture(true);journal.fields.id.value='12';await journal.ready();assert.equal(journal.wrap.hidden,false);assert.equal((await journal.save()).stopped,true,'empty photo form cannot navigate/submit');const jp=journal.select();journal.decode();await jp;await journal.save();assert.equal(journal.logs,0,'journal photo must not mutate canonical record');assert.equal(journal.uploads,1);journal.succeed();await journal.save();assert.equal(journal.logs,0);assert.equal(journal.uploads,2);assert.equal(journal.reloads,1);journal.fields.id.value='99';await journal.ready();assert.equal(journal.wrap.hidden,true,'unlisted journal record cannot use client photo form');
