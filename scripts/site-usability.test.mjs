import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {contentListing} from '../src/content-listing.ts';
import {messagesChatPage} from '../src/messages-chat-page.ts';
import {calendar} from '../src/calendar-page.ts';
import {shoppingNew} from '../src/shopping-new-page.ts';
import {shoppingEdit} from '../src/shopping-edit-page.ts';
import './form-drafts.test.mjs';

function shoppingEditContext(request){
 let writes=0;
 const ctx={request,member:{id:1,family_id:1,role:'OWNER'},session:{csrfToken:'synthetic'},env:{DB:{prepare(sql){return {bind(){return this;},async first(){return {id:7,family_id:1,created_by:1,name:'fixture item',category:null,quantity:'1',memo:'',due_date:null};},async all(){return {results:[]};},async run(){writes++;return {success:true};}};}}}};
 return {ctx,writes:()=>writes};
}
test('shopping edit JSON save confirms persistence; legacy redirect and CSRF boundary remain',async()=>{
 for(const accept of ['application/json','text/html']){
   const fields=new FormData();fields.set('csrf','synthetic');fields.set('name','fixture edited');fields.set('due_date','2026-10-09');
   const request=new Request('https://fixture.invalid/app/shopping_edit.php?id=7',{method:'POST',headers:{accept},body:fields});
   const {ctx,writes}=shoppingEditContext(request),response=await shoppingEdit(request,ctx,7);
   assert.equal(writes(),1);
   if(accept==='application/json')assert.deepEqual(await response.json(),{ok:true,redirect:'/app/tasks.php?date=2026-10-09#shopping-checklist'});
   else {assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/app/tasks.php?date=2026-10-09#shopping-checklist');}
 }
 const fields=new FormData();fields.set('csrf','wrong');fields.set('name','fixture edited');
 const request=new Request('https://fixture.invalid/app/shopping_edit.php?id=7',{method:'POST',headers:{accept:'application/json'},body:fields});
 const {ctx,writes}=shoppingEditContext(request);assert.equal((await shoppingEdit(request,ctx,7)).status,403);assert.equal(writes(),0);
});
test('shopping edit keeps early input and failed saves, blocks duplicate saves and navigation until success',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href);
 const w=new Window({url:'https://fixture.invalid/app/shopping_edit.php?id=7'});
 try{
   const request=new Request(w.location.href),{ctx}=shoppingEditContext(request);
   w.document.body.innerHTML=await (await shoppingEdit(request,ctx,7)).text();
   assert.match(w.document.querySelector('script[src*="shopping-edit.js"]').src,/unsaved-edit-1/);
   const form=w.document.getElementById('shoppingEditForm'),memo=form.querySelector('[name=memo]');memo.value='early fixture draft';
   let allow=false,calls=0,finish,redirect='';w.confirm=()=>allow;w.alert=()=>{};w.location.replace=url=>redirect=url;
   w.fetch=(url,options)=>{calls++;assert.equal(options.headers.accept,'application/json');assert.equal(options.body.get('memo'),'early fixture draft');assert.equal(options.body.get('action'),'save');return new Promise(resolve=>finish=resolve);};
   w.eval(fs.readFileSync('public/assets/shopping-edit.js','utf8'));
   const unload=()=>{const e=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(e);return e.defaultPrevented;};
   assert.equal(unload(),true);
   const link=w.document.querySelector('.bottom-nav a'),click=()=>{const e=new w.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(e);return e.defaultPrevented;};
   assert.equal(click(),true);assert.equal(memo.value,'early fixture draft');
   const submit=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));submit();submit();assert.equal(calls,1);assert.equal(memo.disabled,true);
   allow=true;assert.equal(click(),true);
   const other=w.document.querySelector('form:not(#shoppingEditForm)'),otherSubmit=new w.Event('submit',{bubbles:true,cancelable:true});other.dispatchEvent(otherSubmit);assert.equal(otherSubmit.defaultPrevented,true);
   const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
   finish({ok:false,json:async()=>({ok:false,error:'fixture failure'})});await settle();assert.equal(memo.disabled,false);assert.equal(memo.value,'early fixture draft');assert.equal(unload(),true);
   submit();finish({ok:true,json:async()=>{throw Error('expired session HTML');}});await settle();assert.equal(memo.disabled,false);assert.equal(unload(),true);assert.equal(redirect,'');
   submit();finish({ok:true,json:async()=>({ok:true,redirect:'/app/tasks.php#shopping-checklist'})});await settle();assert.equal(unload(),false);assert.equal(redirect,'/app/tasks.php#shopping-checklist');
 }finally{await w.happyDOM.close();}
});
test('shopping edit does not save the item if optional category registration fails',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href);
 const w=new Window({url:'https://fixture.invalid/app/shopping_edit.php?id=7'});
 try{
  const request=new Request(w.location.href),{ctx}=shoppingEditContext(request);w.document.body.innerHTML=await (await shoppingEdit(request,ctx,7)).text();
  w.alert=()=>{};w.eval(fs.readFileSync('public/assets/shopping-edit.js','utf8'));
  const select=w.document.getElementById('shoppingEditCategorySelect'),custom=w.document.getElementById('shoppingEditCategoryCustom'),register=w.document.getElementById('shoppingEditCategoryRegister');
  select.value='__custom__';select.dispatchEvent(new w.Event('change',{bubbles:true}));custom.value='fixture category';custom.dispatchEvent(new w.Event('input',{bubbles:true}));register.checked=true;
  let calls=[];w.fetch=async url=>{calls.push(url);return {ok:false,json:async()=>({ok:false,error:'fixture failure'})};};
  w.document.getElementById('shoppingEditForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));
  assert.deepEqual(calls,['/api/shopping-categories']);assert.equal(custom.value,'fixture category');assert.equal(register.checked,true);assert.equal(custom.disabled,false);
  const unload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 }finally{await w.happyDOM.close();}
});

test('shopping form preserves input entered before bootstrap and matches the server fifty-item limit',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href);
 const w=new Window({url:'https://fixture.invalid/app/shopping_new.php'});
 try{
 const stmt={bind(){return this;},async all(){return {results:[]};}};
 const response=await shoppingNew({member:{id:1,family_id:1},session:{csrfToken:'synthetic'},env:{DB:{prepare(){return stmt;}}}});
 const markup=await response.text();assert.ok(markup.includes('-return-origin3'));w.document.body.innerHTML=markup;
 w.document.querySelector('[name="product_name[]"]').value='typed before script loads';let alert='';w.alert=text=>alert=text;
 w.eval(fs.readFileSync('public/assets/shopping-new.js','utf8'));
 const unload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 const add=w.document.getElementById('addProduct');for(let i=0;i<49;i++)add.click();assert.equal(w.document.querySelectorAll('[data-product-row]').length,50);
 add.click();assert.equal(w.document.querySelectorAll('[data-product-row]').length,50);assert.match(alert,/50件/);
 }finally{await w.happyDOM.close();}
});

test('shopping draft survives cancelled navigation and failed save; saving blocks duplicate requests and edits',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href);
 const w=new Window({url:'https://fixture.invalid/app/shopping_new.php'});
 try{
 const stmt={bind(){return this;},async all(){return {results:[]};},async first(){return null;}};
 const ctx={member:{id:1,family_id:1,role:'OWNER'},session:{csrfToken:'synthetic'},env:{DB:{prepare(){return stmt;}}},request:new Request(w.location.href)};
 w.document.body.innerHTML=await (await shoppingNew(ctx)).text();
 let allow=false,calls=0,finish,redirect='';w.confirm=()=>allow;w.alert=()=>{};
 w.location.replace=url=>{redirect=url;};w.fetch=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 w.eval(fs.readFileSync('public/assets/shopping-new.js','utf8'));
 const f=w.document.getElementById('shopBatchForm'),name=f.querySelector('[name="product_name[]"]');name.value='synthetic item';name.dispatchEvent(new w.Event('input',{bubbles:true}));
 const back=w.document.querySelector('.page-head a');
 const click=new w.MouseEvent('click',{bubbles:true,cancelable:true});back.dispatchEvent(click);assert.equal(click.defaultPrevented,true);assert.equal(name.value,'synthetic item');
 const unload=()=>{const event=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(event);return event.defaultPrevented;};assert.equal(unload(),true);
 const submit=()=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));submit();submit();assert.equal(calls,1);assert.equal(name.disabled,true);
 allow=true;const during=new w.MouseEvent('click',{bubbles:true,cancelable:true});back.dispatchEvent(during);assert.equal(during.defaultPrevented,true);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 finish({ok:false,json:async()=>({ok:false})});await settle();assert.equal(name.disabled,false);assert.equal(name.value,'synthetic item');assert.equal(unload(),true);
 submit();finish({ok:true,json:async()=>({ok:true})});await settle();assert.equal(calls,2);assert.equal(unload(),false);assert.equal(redirect,'/app/tasks.php#shopping-checklist');
 }finally{await w.happyDOM.close();}
});

test('calendar date jumps contain real dates and today leads to the daily checklist',async()=>{
 const stmt={bind(){return this;},async all(){return {results:[]};},async first(){return null;}};
 const ctx={member:{id:1,family_id:1,role:'OWNER'},session:{csrfToken:'synthetic'},env:{DB:{prepare(){return stmt;}}}};
 const response=await calendar(new Request('https://fixture.invalid/app/calendar.php?month=2026-11'),ctx,'2026-11');
 const html=await response.text(),payload=JSON.parse(html.match(/id="calendarPayload">([^<]+)</)[1]),today=payload.today;
 assert.match(today,/^\d{4}-\d{2}-\d{2}$/);assert.ok(!html.includes('${dateOnly'));assert.ok(!html.includes('${openDate'));
 assert.ok(html.includes('value="'+today+'"'));assert.ok(html.includes('href="/app/calendar.php?month='+today.slice(0,7)+'"'));
 assert.ok(html.includes('href="/app/calendar.php?month='+today.slice(0,7)+'&open='+today+'"'));
 const jump=await calendar(new Request('https://fixture.invalid/app/calendar.php?open='+today),ctx,today.slice(0,7));
 assert.equal(jump.status,302);assert.equal(jump.headers.get('location'),'/app/tasks.php?date='+today);
});

// Synthetic data only. Execute the real reader SQL to catch binding and visibility errors.
function query(sql,values){
  const result=spawnSync('python3',['-c',`
import sqlite3,json,sys
d=json.load(sys.stdin);c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
for name,field in [('tasks','title'),('items','name'),('shopping_items','name')]:
 c.execute('CREATE TABLE '+name+' (id INTEGER PRIMARY KEY,family_id INTEGER,'+field+' TEXT,status TEXT,created_at TEXT,created_by INTEGER,visibility_scope TEXT,private_owner_id INTEGER)')
 for i in range(1,76):c.execute('INSERT INTO '+name+' VALUES (?,?,?,?,?,?,?,?)',(i,1,'sample '+str(i),'pending','2026-10-01',1,'FAMILY',None))
 c.execute('INSERT INTO '+name+' VALUES (?,?,?,?,?,?,?,?)',(90,2,'sample foreign','pending','2026-10-01',2,'FAMILY',None))
 c.execute('INSERT INTO '+name+' VALUES (?,?,?,?,?,?,?,?)',(91,1,'sample private','pending','2026-10-01',2,'PRIVATE',2))
c.executescript('''CREATE TABLE members(id INTEGER,family_id INTEGER,name TEXT,line_picture_url TEXT,active INTEGER,deleted_at TEXT);
INSERT INTO members VALUES(1,1,'member one','',1,NULL),(2,1,'member two','',1,NULL),(3,2,'other family','',1,NULL);
CREATE TABLE messages(id INTEGER PRIMARY KEY,family_id INTEGER,sender_id INTEGER,target_member_id INTEGER,reminder_at TEXT,created_at TEXT,updated_at TEXT,image_upload_id INTEGER,text TEXT,converted_to_shopping_id INTEGER,converted_to_task_id INTEGER);
CREATE TABLE message_reads(id INTEGER,family_id INTEGER,message_id INTEGER,member_id INTEGER);
CREATE TABLE message_stamp_attachments(message_id INTEGER,family_id INTEGER,asset_id INTEGER);
CREATE TABLE calendar_stamp_assets(id INTEGER,family_id INTEGER,active INTEGER);
CREATE TABLE family_log_subjects(id INTEGER,family_id INTEGER,name TEXT);
CREATE TABLE family_logs(id INTEGER PRIMARY KEY,family_id INTEGER,log_type TEXT,occurred_at TEXT,created_at TEXT,created_by INTEGER,subject_id INTEGER,note TEXT,deleted_at TEXT);
INSERT INTO family_log_subjects VALUES(1,1,'child'),(2,2,'foreign');
INSERT INTO family_logs VALUES(1,1,'MEMO','2026-10-01T00:00:00Z','2026-10-01',1,1,'sample note',NULL),(2,1,'MEMO','2026-10-01T00:00:00Z','2026-10-01',1,1,'deleted','2026-10-02'),(3,2,'MEMO','2026-10-01T00:00:00Z','2026-10-01',3,2,'sample note',NULL);''')
for i in range(1,121):c.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?)',(i,1,2,3 if i==30 else None,'9999-01-01' if i==60 else None,'2026-10-01 12:00:00','2026-10-01 12:00:00',None,'sample message '+str(i),None,None))
c.execute("INSERT INTO messages VALUES(160,2,3,NULL,NULL,'2026-10-01','2026-10-01',NULL,'foreign',NULL,NULL)")
print(json.dumps([dict(r) for r in c.execute(d['sql'],d['values'])]))
`],{input:JSON.stringify({sql,values}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}
const url=search=>new URL('https://example.test/app/settings_content.php?'+search);
test('all content kinds enforce family and visibility boundaries with real SQL',()=>{
  for(const kind of ['tasks','items','shopping','messages','logs']){
    const p=contentListing(url('kind='+kind),1,1,'2026-10-08 12:00:00'),rows=query(p.sql,p.values);
    assert.ok(rows.length<=31);assert.ok(!rows.some(r=>(kind==='messages'?[160]:[90,91]).includes(r.id)));
    if(kind==='logs')assert.deepEqual(rows.map(r=>r.id),[1]);
    if(kind==='messages')assert.ok(!rows.some(r=>r.id===60||r.id===30));
  }
});
test('keyset pagination can retrieve old items without duplicates',()=>{
  const seen=[];let before=0;
  while(true){const p=contentListing(url('kind=shopping&before='+before),1,1,'2026-10-08');const rows=query(p.sql,p.values),page=rows.slice(0,30);seen.push(...page.map(r=>r.id));if(rows.length<=30)break;before=page.at(-1).id;}
  assert.equal(seen.length,75);assert.equal(new Set(seen).size,75);assert.equal(seen.at(-1),1);
});
test('search is bound as literal text, keeps old matching records and excludes deleted logs',()=>{
  for(const [kind,q,ids] of [['tasks','sample 1',[19,18,17,16,15,14,13,12,11,10,1]],['logs','sample note',[1]],['messages',"' OR 1=1 --",[]]]){
    const p=contentListing(url('kind='+kind+'&q='+encodeURIComponent(q)),1,1,'2026-10-08');assert.deepEqual(query(p.sql,p.values).map(r=>r.id),ids);
  }
});
test('invalid type and cursor fail closed',()=>{
  for(const kind of ['__proto__','constructor','unknown'])assert.equal(contentListing(url('kind='+kind+'&before=NaN'),1,1,'now').kind,'tasks');
  for(const before of ['-1','1.2','Infinity','9007199254740992'])assert.equal(contentListing(url('before='+before),1,1,'now').before,0);
});
function context(search,memberId=1){return {request:new Request('https://example.test/app/messages.php'+search),session:{csrfToken:'synthetic'},member:{id:memberId,family_id:1,role:'OWNER'},env:{DB:{prepare(sql){let values;return {bind(...v){values=v;return this;},async all(){return {results:query(sql,values)};}};}}}};}
test('focused old message is rendered and highlighted instead of opening latest messages',async()=>{
  const ctx=context('?focus=45'),body=await (await messagesChatPage(ctx.request,ctx)).text();assert.match(body,/id="message-45" class="chat-message is-focused/);assert.match(body,/選択した伝言を表示しています/);assert.doesNotMatch(body,/id="message-120"/);
});
test('focus does not reveal foreign, targeted or unreleased messages',async()=>{
  for(const id of [160,30,60]){const ctx=context('?focus='+id),body=await (await messagesChatPage(ctx.request,ctx)).text();assert.doesNotMatch(body,new RegExp('id="message-'+id+'"'));assert.match(body,/指定の伝言は削除済み、または表示できません/);}
  const ctx=context('?focus=60',2),body=await (await messagesChatPage(ctx.request,ctx)).text();assert.match(body,/id="message-60" class="chat-message is-focused/);
});
test('chat history failures show a manual retry and preserve the draft',async()=>{
  const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href);
  const w=new Window({url:'https://example.test/app/messages.php'}),timers=[];let fail=true,calls=0;
  try{
    w.document.body.innerHTML='<script id="messagesChatPayload" type="application/json">{"memberId":1,"now":"2026-10-08"}</script><p id="chatSyncStatus" hidden></p><section id="chatMessages"><article class="chat-message mine" data-message-id="50"></article><a class="chat-archive-link">以前</a></section><form id="chatComposer"><textarea name="text">synthetic draft</textarea></form>';
    w.setTimeout=fn=>{timers.push(fn);return timers.length;};w.setInterval=()=>0;
    w.fetch=async input=>{calls++;if(fail)throw Error('synthetic offline');return {ok:true,json:async()=>({ok:true,messages:[],hasOlder:false})};};
    w.eval(fs.readFileSync('public/assets/messages-chat.js','utf8'));
    const chat=w.document.getElementById('chatMessages'),settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
    chat.dispatchEvent(new w.Event('scroll'));await settle();
    assert.equal(w.document.querySelector('.chat-history-status').hidden,false);assert.equal(calls,1);
    chat.dispatchEvent(new w.Event('scroll'));await settle();assert.equal(calls,1,'a failed history request must not loop on scrolling');
    fail=false;w.document.querySelector('.chat-history-status button').click();await settle();
    assert.equal(calls,2);assert.equal(w.document.querySelector('.chat-history-status').hidden,true);assert.equal(w.document.querySelector('textarea').value,'synthetic draft');
    fail=true;timers.at(-1)();await settle();assert.equal(w.document.getElementById('chatSyncStatus').hidden,false);
    fail=false;timers.at(-1)();await settle();assert.equal(w.document.getElementById('chatSyncStatus').hidden,true);
  }finally{await w.happyDOM.close();}
});
