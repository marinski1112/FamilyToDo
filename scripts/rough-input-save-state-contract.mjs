import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/assets/task-rough-input-save.js','utf8');
const start=source.indexOf("saveButton.addEventListener('click',async()=>{")+"saveButton.addEventListener('click',async()=>{".length,end=source.indexOf('\n      });',start);
assert.ok(start>0&&end>start);
const button={disabled:false,textContent:'保存'},field={disabled:false},parse={disabled:false},status={textContent:''},links=[];
const preview={dataset:{},querySelectorAll:selector=>selector==='.rough-draft-row'?[{}]:[button,field]};
let calls=0,uncertain=true,pendingResolve=null;
const context=vm.createContext({preview,saveButton:button,actions:{querySelector:()=>status,append:link=>links.push(link)},form:{querySelectorAll:()=>[parse]},readRow:()=>({title:'fixture'}),validateRows:()=>'',
  document:{createElement:()=>({})},setTimeout:()=>0,redirectAfterSave:()=>{},
  saveRows:async()=>{calls++;if(pendingResolve)await new Promise(resolve=>{pendingResolve=resolve;});throw Object.assign(new Error('fixture failure'),{uncertain});}
});
vm.runInContext('async function save(){'+source.slice(start,end)+'\n}',context);
await context.save();assert.equal(calls,1);assert.equal(preview.dataset.saving,'1');assert.equal(button.disabled,true);assert.equal(field.disabled,true);assert.equal(parse.disabled,true);assert.equal(links[0].href,'/app/tasks.php');
await context.save();assert.equal(calls,1,'unknown save result must not allow a duplicate retry');
uncertain=false;preview.dataset.saving='0';button.disabled=field.disabled=parse.disabled=false;
await context.save();assert.equal(preview.dataset.saving,'0');assert.equal(field.disabled,false);assert.equal(parse.disabled,false,'a known failure remains editable');
pendingResolve=()=>{};const saving=context.save();await context.save();assert.equal(calls,3,'only one in-flight save');pendingResolve();await saving;
console.log('rough save: unknown results block duplicate retries; known failures unlock fields; in-flight saves are singular');
