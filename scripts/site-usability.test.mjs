import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {contentListing} from '../src/content-listing.ts';
import {messagesChatPage} from '../src/messages-chat-page.ts';

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
