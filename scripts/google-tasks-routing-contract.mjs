import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ft-routing-'));
const dbfile=path.join(tmp,'db.sqlite');
const python=`import sqlite3,json,sys
p=json.load(sys.stdin)
c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row
c.execute('PRAGMA foreign_keys=ON')
try:
 if 'script' in p: c.executescript(p['script']);out=[]
 else:
  out=[]
  with c:
   for i,s in enumerate(p['statements']):
    if i==p.get('failAt',-1): raise RuntimeError('injected failure')
    cur=c.execute(s['sql'],s['args']);rows=[dict(r) for r in cur.fetchall()]
    out.append({'rows':rows,'meta':{'changes':max(cur.rowcount,0),'last_row_id':cur.lastrowid}})
 print(json.dumps(out))
finally: c.close()
`;
function rpc(p){const r=spawnSync('python3',['-c',python,dbfile],{input:JSON.stringify(p),encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout);}
let failAt=-1,statements=0;
const DB={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async first(){statements++;return rpc({statements:[this]})[0].rows[0]||null;}};},async batch(ss){statements+=ss.length;return rpc({statements:ss,failAt});}};
const timezone=stripTypeScriptTypes(fs.readFileSync('src/timezone.ts','utf8')).replace(/export /g,'');
const routing=stripTypeScriptTypes(fs.readFileSync('src/google-tasks-routing.ts','utf8')).replace(/^import .*;$/gm,'').replace(/export /g,'');
const sandbox={crypto:webcrypto,Date,Intl};vm.createContext(sandbox);
vm.runInContext(timezone+'\n'+routing+'\nthis.parse=parseChecklistRoute;this.apply=applyChecklistRoute;',sandbox);
const parse=(s,due='',updated='2026-09-09T14:59:00Z',zone='Asia/Tokyo')=>JSON.parse(JSON.stringify(sandbox.parse(s,due,updated,zone)));
const schema=`
CREATE TABLE families(id INTEGER PRIMARY KEY,timezone TEXT);
CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER,active INTEGER,deleted_at TEXT);
CREATE TABLE external_google_task_accounts(id INTEGER PRIMARY KEY,family_id INTEGER,member_id INTEGER,tasklist_id TEXT,status TEXT,import_visibility TEXT);
CREATE TABLE external_google_task_links(account_id INTEGER,external_tasklist_id TEXT,external_task_id TEXT);
CREATE TABLE external_google_voice_commands(account_id INTEGER,external_tasklist_id TEXT,external_task_id TEXT);
CREATE TABLE tasks(id INTEGER PRIMARY KEY,family_id INTEGER,title TEXT,due_at TEXT,status TEXT,completion_mode TEXT,created_by INTEGER,created_at TEXT,updated_at TEXT,start_at TEXT,end_at TEXT,calendar_visible INTEGER,task_kind TEXT,all_day INTEGER,visibility_scope TEXT,private_owner_id INTEGER);
CREATE TABLE task_assignees(task_id INTEGER REFERENCES tasks(id),member_id INTEGER REFERENCES members(id),UNIQUE(task_id,member_id));
CREATE TABLE shopping_items(id INTEGER PRIMARY KEY,family_id INTEGER,name TEXT,quantity TEXT,category TEXT,due_date TEXT,status TEXT,created_by INTEGER,created_at TEXT,updated_at TEXT,task_id INTEGER REFERENCES tasks(id),url TEXT);
CREATE TABLE shopping_assignees(shopping_item_id INTEGER REFERENCES shopping_items(id),member_id INTEGER REFERENCES members(id),UNIQUE(shopping_item_id,member_id));
CREATE TABLE items(id INTEGER PRIMARY KEY,family_id INTEGER,name TEXT,memo TEXT,due_at TEXT,status TEXT,completion_mode TEXT,created_by INTEGER,created_at TEXT,updated_at TEXT,task_id INTEGER REFERENCES tasks(id));
CREATE TABLE item_assignees(item_id INTEGER REFERENCES items(id),member_id INTEGER REFERENCES members(id),UNIQUE(item_id,member_id));
INSERT INTO families VALUES(1,'Asia/Tokyo'),(2,'Asia/Tokyo');
INSERT INTO members VALUES(10,1,1,NULL),(20,2,1,NULL);
INSERT INTO external_google_task_accounts VALUES(1,1,10,'list','ACTIVE','PRIVATE');
`;
const query=(sql,args=[])=>rpc({statements:[{sql,args}]})[0].rows;
const account={id:1,family_id:1,member_id:10,tasklist_id:'list',import_visibility:'PRIVATE'};
let seq=0;
const item=(title,extra={})=>({id:String(++seq),title,etag:'v1',status:'needsAction',updated:'2026-09-09T14:59:00Z',...extra});
try{
  assert.deepEqual(parse('牛乳と卵を明日の買い物に追加'),{kind:'SHOPPING',names:['牛乳','卵'],date:'2026-09-10',reason:null});
  assert.deepEqual(parse('明日の持ち物：水筒、とろろ'),{kind:'ITEM',names:['水筒','とろろ'],date:'2026-09-10',reason:null});
  assert.equal(parse('書類提出をタスクに追加').kind,'TASK');
  assert.equal(parse('牛乳を買って').kind,'SHOPPING');
  assert.equal(parse('明日の持ち物：水筒','','2026-09-09T15:01:00Z').date,'2026-09-11');
  assert.equal(parse('明日の持ち物：水筒','','2026-09-09T15:01:00Z','UTC').date,'2026-09-10');
  assert.equal(parse('牛乳を明日の買い物に追加','2026-09-12T00:00:00Z').reason,'DATE_CONFLICT');
  assert.equal(parse('2026-02-30の持ち物：水筒').reason,'INVALID_DATE');
  assert.equal(parse('明日の持ち物：水筒','','bad').reason,'DATE_REFERENCE_MISSING');
  assert.equal(parse('買い物：牛乳 2').reason,'QUANTITY_NEEDS_REVIEW');
  assert.equal(parse('遠足の持ち物に水筒を持ち物に追加').reason,'AMBIGUOUS_INSTRUCTION');
  for(const text of ['会議資料','FT 買い物 牛乳 2','FT タスク ゴミ出し','FT ミルク160','昨日の移動を教えて'])assert.equal(parse(text),null,text);
  assert.equal(parse('持ち物：'+Array(21).fill('物').join('、')).reason,'INVALID_ITEMS');
  rpc({script:schema+fs.readFileSync('migrations/0070_google_tasks_routing.sql','utf8')});
  const first=item('牛乳と卵を明日の買い物に追加');statements=0;
  assert.equal(await sandbox.apply({DB},account,first),'command');assert.ok(statements<=10,statements);
  assert.deepEqual(query('SELECT name,quantity,due_date FROM shopping_items ORDER BY id'),[{name:'牛乳',quantity:'1',due_date:'2026-09-10'},{name:'卵',quantity:'1',due_date:'2026-09-10'}]);
  assert.deepEqual(query('SELECT visibility_scope,private_owner_id,calendar_visible FROM tasks'),[{visibility_scope:'PRIVATE',private_owner_id:10,calendar_visible:0}]);
  assert.equal(await sandbox.apply({DB},account,first),'noop');
  assert.equal(await sandbox.apply({DB},account,{...first,title:'普通のタスクに変更',etag:'v2'}),'noop');
  assert.equal(query('SELECT COUNT(*) n FROM shopping_items')[0].n,2);
  const retry=item('持ち物：水筒、タオル');failAt=3;
  await assert.rejects(()=>sandbox.apply({DB},account,retry));failAt=-1;
  assert.equal(query('SELECT COUNT(*) n FROM google_tasks_routes WHERE external_id=?',[retry.id])[0].n,0);
  assert.equal(query('SELECT COUNT(*) n FROM tasks')[0].n,1);
  assert.equal(await sandbox.apply({DB},account,retry),'command');
  assert.equal(query('SELECT COUNT(*) n FROM item_assignees')[0].n,2);
  const bad=item('買い物：牛乳 2');assert.equal(await sandbox.apply({DB},account,bad),'review');
  assert.equal(await sandbox.apply({DB},account,{...bad,title:'買い物：牛乳',etag:'v2'}),'command');
  const revoked=item('持ち物：傘');query("UPDATE external_google_task_accounts SET status='REVOKED'");
  assert.equal(await sandbox.apply({DB},account,revoked),'noop');
  query("UPDATE external_google_task_accounts SET status='ACTIVE',import_visibility='FAMILY'");
  assert.equal(await sandbox.apply({DB},{...account,family_id:2,member_id:20},revoked),'noop');
  const family=item('掃除と洗濯をタスクに追加');await sandbox.apply({DB},account,family);
  assert.equal(query("SELECT COUNT(*) n FROM tasks WHERE visibility_scope='FAMILY' AND private_owner_id IS NULL")[0].n,2);
  const legacy=item('持ち物：ノート');query('INSERT INTO external_google_task_links VALUES(1,?,?)',['list',legacy.id]);
  assert.equal(await sandbox.apply({DB},account,legacy),'not-handled');
  assert.equal(await sandbox.apply({DB},account,item('持ち物：ペン',{deleted:true})),'not-handled');
  assert.equal(await sandbox.apply({DB},account,item('買い物：牛乳',{status:'completed'})),'noop');
  assert.equal(query("SELECT COUNT(*) n FROM google_tasks_routes WHERE status='PENDING'")[0].n,0);
  console.log('google-tasks-routing: date/grammar, privacy, tenant/auth, replay, rollback/retry and legacy ownership OK');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
