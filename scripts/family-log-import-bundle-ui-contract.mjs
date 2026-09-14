import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/assets/family-log-import-piyolog.js','utf8');
async function scenario(journal){
 const elements=[];
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.disabled=false;this.files=[];elements.push(this);}
  append(...items){for(const e of items){this.children.push(e);if(e&&typeof e==='object')e.parentElement=this;}}
  appendChild(e){this.append(e);return e;}insertBefore(e){this.append(e);}insertAdjacentElement(_,e){(this.parentElement||root).append(e);}
  replaceChildren(...items){this.children=[];this.append(...items);}addEventListener(k,v){this.listeners[k]=v;}setAttribute(){}
  querySelector(s){const all=this.children.flatMap(e=>e instanceof Element?[e,...e.descendants()]:[]);return all.find(e=>s==='progress'?e.tagName==='progress':s==='.import-progress-label'?e.className==='import-progress-label':e.className==='btn gray')||null;}
  descendants(){return this.children.flatMap(e=>e instanceof Element?[e,...e.descendants()]:[]);}
 }
 const root=new Element();const ids={};for(const id of ['familyLogImportPayload','importFile','importSubject','importStatus','importPreviewOut','importPreview']){ids[id]=new Element(id==='importPreview'?'button':id==='importSubject'?'select':id==='importFile'?'input':'div');root.append(ids[id]);}
 ids.familyLogImportPayload.textContent=JSON.stringify({csrf:'x',maxBytes:3000000,subjects:{10:'child'},types:{MEMO:{label:'メモ'}}});ids.importSubject.value='10';
 const record={external_id:'m1',journal:true,log_type:'MEMO',detail_code:'JOURNAL_MEMO',value_text:'成長',occurred_at:'2025-01-01T12:00:00+09:00'};
 const doc={format:'familytodo-family-log-import-v1',source:'piyolog',records:journal?[record]:[],foods:journal?[]:[{name:'米',category:'GRAIN',first_tried_on:null,stages:[]}]};
 ids.importFile.files=[{name:'import.json',size:100,text:async()=>JSON.stringify(doc)}];
 const actions=[];
 const document={getElementById:id=>ids[id],createElement:tag=>new Element(tag),createTextNode:text=>text,querySelectorAll:selector=>selector==='input,select,button'?elements.filter(e=>['input','select','button'].includes(e.tagName)):[]};
 const fetch=async(_,options)=>{const b=JSON.parse(options.body);actions.push(b.action);let d={ok:true};
  if(b.action==='preview')d={...d,source:'piyolog',record_count:doc.records.length,new_count:0,duplicate_count:doc.records.length,error_count:0,type_counts:{},rows:[]};
  if(b.action==='foods_preview')d={...d,new_count:1,existing_count:0};
  if(b.action==='foods_apply')d={...d,added:1,existing:0};
  if(b.action==='start')d={...d,batch_id:1,processed_count:0,chunk_size:100,record_count:1};
  if(b.action==='chunk'||b.action==='finish')d={...d,processed_count:1,record_count:1,imported_count:0,skipped_count:1,error_count:0};
  return {ok:true,json:async()=>d};};
 vm.runInNewContext(source,{document,fetch,confirm:()=>true,alert(){},location:{reload(){}},setTimeout,clearTimeout,URL,AbortController,console});
 await ids.importPreview.onclick();
 const button=ids.importPreviewOut.children.find(e=>e.tagName==='button'&&e.textContent==='インポート確定');assert.ok(button);assert.equal(button.disabled,false);
 await button.onclick();assert.equal(ids.importSubject.disabled,false,'target selector must recover');
 if(journal){assert.ok(actions.includes('start')&&actions.includes('chunk')&&actions.includes('finish'),'duplicate logs still need explicit journal marker enrichment');}
 else{assert.ok(actions.includes('foods_apply'));assert.ok(!actions.includes('start'),'food-only input must not create an empty log batch');}
 ids.importSubject.listeners.change();assert.equal(ids.importPreviewOut.children.length,0,'stale preview invalidated on target change');
}
await scenario(false);await scenario(true);console.log('bundle UI: food-only, duplicate-journal, scope lock recovery and preview invalidation PASS');
