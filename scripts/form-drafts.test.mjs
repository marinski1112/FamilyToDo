import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {itemNew} from '../src/new-entry-pages.ts';
import {itemEdit} from '../src/item-edit-page.ts';
import {taskEdit} from '../src/task-edit-page.ts';
import {childJournalApi,childJournalPage} from '../src/child-journal.ts';
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function windowFor(url){const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href);return new Window({url});}
function fixture(request){
 const writes=[];
 const row={id:7,family_id:1,created_by:1,name:'fixture item',title:'fixture task',quantity:'1',category:null,memo:'',description:'',due_at:'2026-10-08',start_at:'2026-10-08 00:00:00',end_at:'2026-10-08 23:59:59',all_day:1,calendar_visible:1,task_kind:'TASK',visibility_scope:'FAMILY',status:'pending',subject_kind:'BABY'};
 const ctx={request,member:{id:1,family_id:1,role:'OWNER',family_timezone:'Asia/Tokyo'},session:{csrfToken:'synthetic'},env:{DB:{
  prepare(sql){return {bind(...v){this.values=v;return this;},async first(){return row;},async all(){return {results:sql.includes('SELECT id,name,subject_kind,icon')?[{id:7,name:'fixture child',subject_kind:'BABY'}]:[]};},async run(){writes.push({sql,values:this.values});return {success:true,meta:{last_row_id:8,changes:1}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}
 }}};
 return {ctx,writes};
}
function load(w,file){w.eval(fs.readFileSync('public/assets/'+file,'utf8'));}
function unloading(w){const e=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(e);return e.defaultPrevented;}
function submit(w,f){const e=new w.Event('submit',{bubbles:true,cancelable:true});f.dispatchEvent(e);return e;}
function change(w,el,value){el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('draft guard preserves cancelling, ignores same-page links and locks all other forms during saving',async()=>{
 const w=await windowFor('https://fixture.invalid/edit');
 try{
  w.document.body.innerHTML='<form id="draft"><input name="title" value="original"><input type="checkbox" disabled></form><form id="other"></form><a href="/next">next</a><a href="#section">section</a>';
  load(w,'form-draft-guard.js');const f=w.document.getElementById('draft'),g=w.FamilyTodoDraftGuard.attach(f);let confirms=0;w.confirm=()=>{confirms++;return false;};w.alert=()=>{};
  assert.equal(unloading(w),false);change(w,f.elements.title,'edited');assert.equal(unloading(w),true);
  const click=link=>{const e=new w.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(e);return e.defaultPrevented;};
  assert.equal(click(w.document.querySelector('a[href="/next"]')),true);assert.equal(f.elements.title.value,'edited');assert.equal(click(w.document.querySelector('a[href="#section"]')),false);assert.equal(confirms,1);
  assert.equal(g.startSaving(),true);assert.equal(g.startSaving(),false);assert.equal(f.elements.title.disabled,true);assert.equal(submit(w,w.document.getElementById('other')).defaultPrevented,true);assert.equal(click(w.document.querySelector('a[href="/next"]')),true);
  g.failed();assert.equal(f.elements.title.disabled,false);assert.equal(f.querySelector('[type=checkbox]').disabled,true);assert.equal(unloading(w),true);
  g.saved();assert.equal(unloading(w),false);
 }finally{await w.happyDOM.close();}
});
test('item new rendered page protects early input, keeps failed saves and blocks duplicate registration',async()=>{
 const w=await windowFor('https://fixture.invalid/item/new.php');
 try{
  const {ctx}=fixture(new Request(w.location.href));const markup=await (await itemNew(ctx,'2026-10-08')).text();assert.match(markup,/item-new.js\?v=[^"]+-draft1/);assert.ok(markup.indexOf('form-draft-guard.js')<markup.indexOf('id="itemForm"'));w.document.body.innerHTML=markup;
  const f=w.document.getElementById('itemForm');f.elements.name.value='early fixture';let calls=0,finish;const ids=[];
  w.fetch=(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.name,'early fixture');assert.ok(body.client_request_id.length>=32);ids.push(body.client_request_id);return new Promise(r=>finish=r);};w.alert=()=>{};
  load(w,'form-draft-guard.js');load(w,'item-new.js');assert.equal(unloading(w),true);
  submit(w,f);submit(w,f);assert.equal(calls,1);assert.equal(f.elements.name.disabled,true);
  finish({ok:false,status:500,json:async()=>({ok:false})});await settle();assert.equal(f.elements.name.disabled,false);assert.equal(f.elements.name.value,'early fixture');assert.equal(unloading(w),true);
  submit(w,f);finish({ok:true,json:async()=>({ok:true,date:'2026-10-08'})});await settle();assert.equal(ids[0],ids[1]);assert.equal(unloading(w),false);assert.equal(w.location.pathname,'/app/tasks.php');
 }finally{await w.happyDOM.close();}
});
test('a lost child journal save response keeps the draft and requires checking history before another create',async()=>{
 const w=await windowFor('https://fixture.invalid/app/child_journal.php');
 try{
  const request=new Request(w.location.href),{ctx}=fixture(request);w.document.body.innerHTML=await (await childJournalPage(request,ctx)).text();
  load(w,'form-draft-guard.js');load(w,'guarded-form-post.js');const f=w.document.querySelector('form[data-draft-post]');change(w,f.elements.title,'fixture draft');let calls=0;w.fetch=async()=>{calls++;throw Error('response lost');};
  submit(w,f);await settle();submit(w,f);await settle();assert.equal(calls,1);assert.equal(f.elements.title.value,'fixture draft');assert.equal(f.elements.title.disabled,false);assert.equal(f.querySelector('button[type=submit]').disabled,true);assert.match(f.querySelector('[role=alert]').textContent,/日記一覧/);assert.equal(unloading(w),true);
 }finally{await w.happyDOM.close();}
});
test('native item edit and child journal keep input on auth HTML and response errors until explicit success',async()=>{
 for(const [path,render] of [['/item/edit.php?id=7',(r,c)=>itemEdit(r,c,7)],['/app/child_journal.php',childJournalPage]]){
  const w=await windowFor('https://fixture.invalid'+path);
  try{
   const request=new Request(w.location.href),{ctx}=fixture(request),markup=await (await render(request,ctx)).text();assert.match(markup,/guarded-form-post.js/);w.document.body.innerHTML=markup;
   load(w,'form-draft-guard.js');load(w,'guarded-form-post.js');const f=w.document.querySelector('form[data-draft-post]'),entry=f.querySelector('[name=memo],[name=title]');change(w,entry,'fixture draft');
   let calls=0,finish,redirect='';w.location.replace=url=>redirect=url;w.fetch=(url,options)=>{calls++;assert.equal(options.headers.accept,'application/json');assert.equal(options.body.get(entry.name),'fixture draft');return new Promise(r=>finish=r);};w.alert=()=>{};
   submit(w,f);submit(w,f);assert.equal(calls,1);finish({ok:false,status:403,json:async()=>{throw Error('authentication HTML');}});await settle();assert.equal(redirect,'');assert.equal(entry.value,'fixture draft');assert.equal(entry.disabled,false);assert.equal(unloading(w),true);assert.equal(f.querySelector('[role=alert]').hidden,false);
   submit(w,f);finish({ok:false,status:400,json:async()=>({ok:false})});await settle();assert.equal(unloading(w),true);
   submit(w,f);finish({ok:true,json:async()=>({ok:true,redirect:f.dataset.successPath+'?fixture=1'})});await settle();assert.equal(unloading(w),false);assert.equal(redirect,f.dataset.successPath+'?fixture=1');
  }finally{await w.happyDOM.close();}
 }
});
test('task edit does not treat an authentication redirect as save success and serializes one request',async()=>{
 const w=await windowFor('https://fixture.invalid/task/edit.php?id=7');
 try{
  const request=new Request(w.location.href),{ctx}=fixture(request);w.document.body.innerHTML=await (await taskEdit(request,ctx,7)).text();let posts=0,finish;
  w.alert=()=>{};w.fetch=(url,options)=>options?.method==='POST'?(posts++,new Promise(r=>finish=r)):Promise.resolve({ok:true,json:async()=>({ok:true,parent:{visibilityScope:'FAMILY'},canAddChildren:true,children:[]})});
  load(w,'form-draft-guard.js');load(w,'task-edit.js');await settle();assert.equal(w.document.documentElement.dataset.taskEditJs,'ready');assert.equal(unloading(w),false);
  const f=w.document.getElementById('taskEditForm');change(w,f.elements.description,'fixture task draft');submit(w,f);submit(w,f);assert.equal(posts,1);
  finish({ok:true,redirected:true,url:'https://fixture.invalid/login.php',json:async()=>{throw Error('HTML');}});await settle();assert.equal(w.location.pathname,'/task/edit.php');assert.equal(f.elements.description.value,'fixture task draft');assert.equal(f.elements.title.disabled,false);assert.equal(unloading(w),true);
  submit(w,f);finish({ok:true,json:async()=>({ok:true,redirect:'/task/view.php?id=7'})});await settle();assert.equal(unloading(w),false);assert.equal(w.location.pathname,'/task/view.php');
 }finally{await w.happyDOM.close();}
});
test('child save failures preserve child drafts and successful child saves do not clear parent edits',async()=>{
 const w=await windowFor('https://fixture.invalid/task/edit.php?id=7');
 try{
  const request=new Request(w.location.href),{ctx}=fixture(request);w.document.body.innerHTML=await (await taskEdit(request,ctx,7)).text();let posts=0,finish;const ids=[];
  w.alert=()=>{};w.fetch=(url,options)=>{if(options?.method==='POST'){posts++;ids.push(options.headers['Idempotency-Key']);return new Promise(r=>finish=r);}return Promise.resolve({ok:true,json:async()=>({ok:true,parent:{visibilityScope:'FAMILY'},canAddChildren:true,children:[]})});};
  load(w,'form-draft-guard.js');load(w,'task-edit.js');await settle();const f=w.document.getElementById('taskEditForm');change(w,f.elements.title,'unsaved parent');change(w,w.document.getElementById('childTaskTitle'),'unsaved child');
  submit(w,f);assert.equal(posts,0);assert.equal(w.document.getElementById('childTaskTitle').value,'unsaved child');
  w.document.getElementById('childTaskCreate').click();submit(w,f);assert.equal(posts,1);finish({ok:false,json:async()=>({ok:false})});await settle();assert.equal(w.document.getElementById('childTaskTitle').value,'unsaved child');assert.equal(unloading(w),true);
  w.document.getElementById('childTaskCreate').click();finish({ok:true,json:async()=>({ok:true,id:8})});await settle();assert.equal(f.elements.title.value,'unsaved parent');assert.equal(unloading(w),true);assert.equal(f.elements.title.disabled,false);assert.ok(ids[0].length>=32);assert.equal(ids[0],ids[1]);change(w,f.elements.title,'fixture task');assert.equal(unloading(w),false);
 }finally{await w.happyDOM.close();}
});
test('item, task and journal explicit JSON successes preserve legacy redirects and reject CSRF before writes',async()=>{
 for(const [path,call,data,isJson] of [
  ['/item/edit.php?id=7',(r,c)=>itemEdit(r,c,7),{name:'fixture',action:'save'},false],
  ['/task/edit.php?id=7',(r,c)=>taskEdit(r,c,7),{title:'fixture',date:'2026-10-08',end_date:'2026-10-08',all_day:true},true],
  ['/api/child-journal',childJournalApi,{subject_id:'7',occurred_date:'2026-10-08',kind:'MEMO',title:'fixture'},false],
 ])for(const accept of ['application/json','text/html']){
  for(const csrf of ['synthetic','wrong']){
   const payload={...data,csrf},body=isJson?JSON.stringify(payload):new URLSearchParams(payload),headers={accept,'content-type':isJson?'application/json':'application/x-www-form-urlencoded'};
   const request=new Request('https://fixture.invalid'+path,{method:'POST',headers,body}),{ctx,writes}=fixture(request);
   if(csrf==='wrong'){if(path==='/api/child-journal')await assert.rejects(call(request,ctx),/CSRF/);else assert.equal((await call(request,ctx)).status,403);assert.equal(writes.length,0);continue;}
   const result=await call(request,ctx);assert.ok(writes.length>0);
   if(accept==='application/json'){assert.equal(result.status,200);const value=await result.json();assert.equal(value.ok,true);assert.ok(value.redirect.startsWith('/'));}
   else assert.ok([302,303].includes(result.status));
  }
 }
});
