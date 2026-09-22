import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync('public/assets/'+p,'utf8');
const source=read('checklist-controller.js');
const make=source.slice(source.indexOf('const makeQuickForm='),source.indexOf("makeQuickForm(page.querySelector"));
class Element{constructor(){this.dataset={};this.listeners={};}addEventListener(k,f){this.listeners[k]=f;}focus(){}querySelector(){return null;}}
class Input extends Element{constructor(){super();this.value='予定';}}
class Form extends Element{constructor(){super();this.input=new Input();this.status=new Element();}querySelector(s){return s==='.section-quick-name'?this.input:s==='.section-quick-status'?this.status:null;}}
for(const kind of ['task','event'])for(const failure of [false,true]){
 let form,body,reloaded=false;
 const section=new Element();section.dataset.kindTab=kind;section.querySelector=s=>s.includes('section-head')?{insertAdjacentElement(){}}:null;
 const ctx={HTMLElement:Element,HTMLInputElement:Input,HTMLFormElement:Form,document:{createElement(){return form=new Form();}},payload:{csrf:'test'},selectedDate:'2026-09-19',localStorage:{getItem(){return '#12ab34'}},fetch:async(u,o)=>{body=JSON.parse(o.body);if(failure)throw Error('network');return {ok:true,json:async()=>({ok:true,id:7})};},location:{reload(){reloaded=true;}},requestAnimationFrame:f=>f(),addTaskRow(){},addShoppingRow(){},addItemRow(){},section};
 vm.runInNewContext(make+';makeQuickForm(section,"task");',ctx);
 form.input.listeners.keydown({key:'Enter',preventDefault(){},stopImmediatePropagation(){}});
 await new Promise(r=>setImmediate(r));
 assert.equal(body.is_event,kind==='event');assert.equal(body.dateOnly,'2026-09-19');assert.equal(body.calendar_color,'#12ab34');assert.equal(form.input.disabled,false);
 assert.equal(reloaded,!failure&&kind==='event');if(failure)assert.equal(form.input.value,'予定');
}
const flow=read('checklist-controller.js');
assert(flow.includes('const titleSelector='));
assert(!flow.includes('reminders-smart-card'));
assert(!flow.includes("querySelector('.reminders-quick-entry')"));
const ui=read('checklist-hierarchy-followup.js');
assert(ui.includes('if(liveAdd instanceof HTMLElement)'));
const sets=read('checklist-shopping-reusable-sets.js');
for(const contract of ['selection.querySelectorAll(\'input:checked\')','source_item_ids:source',"action:'reusable_set_invoke'","action:'reusable_set_delete'",'client_request_id:rid','この日に配置'])assert(sets.includes(contract),contract);
console.log('Checklist Task/Event payload/date/color/failure and reusable-set contracts passed');
