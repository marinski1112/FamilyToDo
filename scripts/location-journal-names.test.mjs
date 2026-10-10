import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {transform} from 'esbuild';
import {Window} from 'happy-dom';

const compile=async file=>(await transform(fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,''),{loader:'ts',format:'cjs'})).code;
const journalCode=await compile('src/family-daily-journal.ts'),apiCode=await compile('src/location-history-api.ts');
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE members(id INTEGER,family_id INTEGER,name TEXT,active INTEGER);
 CREATE TABLE location_devices(member_id INTEGER,family_id INTEGER,enabled INTEGER,sharing_enabled INTEGER,revoked_at TEXT);
 CREATE TABLE location_history_archive_days(family_id INTEGER,member_id INTEGER,local_date TEXT,route_point_count INTEGER);
 CREATE TABLE location_history_stays(id INTEGER PRIMARY KEY,family_id INTEGER,member_id INTEGER,local_date TEXT,started_at TEXT,ended_at TEXT,duration_minutes INTEGER,place_label TEXT,address_label TEXT,anchor_latitude REAL,anchor_longitude REAL,updated_at TEXT);
 CREATE TABLE family_daily_journals(family_id INTEGER,journal_date TEXT,summary_text TEXT,location_json TEXT,tasks_json TEXT,housework_json TEXT,generated_at TEXT,updated_at TEXT,content_version INTEGER,storage_tier TEXT,archive_object_key TEXT,archived_at TEXT,UNIQUE(family_id,journal_date));
 INSERT INTO members VALUES(1,1,'A',1),(2,2,'B',1);
 INSERT INTO location_devices VALUES(1,1,1,1,NULL),(2,2,1,1,NULL);
 INSERT INTO location_history_archive_days VALUES(1,1,'2026-01-01',2);
 INSERT INTO location_history_stays VALUES(10,1,1,'2026-01-01','2026-01-01T01:00:00Z','2026-01-01T02:00:00Z',60,'未登録地点付近',NULL,NULL,NULL,NULL),(20,2,2,'2026-01-01','2026-01-01T01:00:00Z','2026-01-01T02:00:00Z',60,'別家族拠点',NULL,NULL,NULL,NULL);
 INSERT INTO family_daily_journals VALUES(1,'2026-01-01','','[]','[]','[]','','',1,'HOT',NULL,NULL);`);
 const db={prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...v){args=v;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};}};
 const journal=vm.createContext({module:{exports:{}},exports:{}});journal.exports=journal.module.exports;vm.runInContext(journalCode,journal);vm.runInContext('readTasks=async()=>[];readHousework=async()=>[];',journal);
 const api=vm.createContext({module:{exports:{}},exports:{},json:(body,status=200)=>new Response(JSON.stringify(body),{status}),constantTimeEqual:(a,b)=>a===b,repairFamilyDailyJournal:journal.module.exports.repairFamilyDailyJournal});api.exports=api.module.exports;vm.runInContext(apiCode,api);
 const call=async(body,options={})=>api.module.exports.locationStayAddressApi(new Request('https://fixture.invalid/api/location/stay-address',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':options.csrf??'test'},body:JSON.stringify(body)}),{member:options.member===undefined?{id:1,family_id:1}:options.member,session:{csrfToken:'test'},env:{DB:db}});
 return {sql,db,api,call};
}
test('saved geographical names immediately update journal content and search evidence, without repeated version changes',async()=>{
 const f=fixture();try{
  const body={archiveStayId:10,addressLabel:'東京都港区芝公園'};
  assert.equal((await f.call(body)).status,200);
  let row=f.sql.prepare('SELECT * FROM family_daily_journals').get();assert.equal(row.content_version,2);assert.match(row.location_json,/東京都港区芝公園/);assert.match(row.summary_text,/東京都港区芝公園/);
  assert.equal((await f.call(body)).status,200);assert.equal(f.sql.prepare('SELECT content_version FROM family_daily_journals').get().content_version,2);
  f.sql.exec("UPDATE location_history_stays SET place_label='買い物拠点' WHERE id=10");assert.equal((await f.call({...body,addressLabel:'東京都港区台場'})).status,200);assert.match(f.sql.prepare('SELECT location_json FROM family_daily_journals').get().location_json,/東京都港区台場/);
  f.sql.exec("UPDATE location_history_stays SET place_label='自宅' WHERE id=10");assert.equal((await f.call(body)).status,200);assert.match(f.sql.prepare('SELECT location_json FROM family_daily_journals').get().location_json,/自宅/);
 }finally{f.sql.close();}
});
test('address writes preserve login, CSRF, family and sharing gates and report unavailable records',async()=>{
 const f=fixture(),body={archiveStayId:10,addressLabel:'東京都港区'};try{
  assert.equal((await f.call(body,{member:null})).status,401);assert.equal((await f.call(body,{csrf:'wrong'})).status,403);assert.equal((await f.call({...body,archiveStayId:20})).status,404);
  f.sql.exec('UPDATE location_devices SET sharing_enabled=0 WHERE member_id=1');assert.equal((await f.call(body)).status,404);assert.equal(f.sql.prepare('SELECT address_label FROM location_history_stays WHERE id=10').get().address_label,null);
  f.sql.exec('UPDATE location_devices SET sharing_enabled=1,revoked_at=CURRENT_TIMESTAMP WHERE member_id=1');assert.equal((await f.call(body)).status,404);
  assert.equal((await f.call({...body,addressLabel:'bad\nlabel'})).status,400);
 }finally{f.sql.close();}
});
test('archived null anchors remain absent instead of becoming latitude/longitude zero',async()=>{
 const f=fixture();try{
  const response=await vm.runInContext('archivedResponse',f.api)({env:{DB:f.db}},1,1,'2026-01-01',{route_json:'[]',raw_point_count:0});const data=await response.json();assert.equal(data.report[0].anchor,undefined);
 }finally{f.sql.close();}
});
async function domFixture(history,writeStatus=200){
 const w=new Window({url:'https://fixture.invalid/app/family_journal.php?date=2026-01-01'}),requests=[],lookups=[];
 w.document.body.innerHTML='<button id="journalLocationNames"></button><p id="journalLocationNamesStatus"></p><script type="application/json" id="journalLocationPayload">{"members":[1],"date":"2026-01-01","csrf":"test","mapsKey":"fixture"}</script>';
 w.google={maps:{Geocoder:class{async geocode(options){lookups.push(options);return {results:[{formatted_address:'日本 東京都港区芝公園4-2-8 建物名',address_components:[{types:['administrative_area_level_1'],long_name:'東京都'},{types:['locality'],long_name:'港区'},{types:['sublocality_level_1'],long_name:'芝公園'}]}]};}}}};
 w.fetch=async(url,options={})=>{requests.push({url,options});return url.startsWith('/api/location/history?')?new Response(JSON.stringify({ok:true,report:history})):new Response('{}',{status:writeStatus});};
 w.eval(fs.readFileSync('public/assets/family-journal-location.js','utf8'));w.document.getElementById('journalLocationNames').click();
 for(let i=0;i<100&&w.document.getElementById('journalLocationNames').disabled;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(w.document.getElementById('journalLocationNames').disabled,false);
 return {w,requests,lookups,status:w.document.getElementById('journalLocationNamesStatus')};
}
const stay={kind:'STAY',place:'未登録地点付近',archiveStayId:10,anchor:{latitude:35,longitude:139}};
test('journal UI resolves and persists a coarse location name with CSRF, preserves home/work and refuses null anchors',async()=>{
 const f=await domFixture([stay,{...stay,archiveStayId:11,place:'自宅'},{...stay,archiveStayId:12,anchor:{latitude:null,longitude:null}}]);try{
  assert.equal(f.lookups.length,1);const writes=f.requests.filter(r=>r.options.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].options.headers['x-csrf-token'],'test');assert.deepEqual(JSON.parse(writes[0].options.body),{archiveStayId:10,addressLabel:'東京都港区芝公園'});assert(f.status.querySelector('a'));assert.doesNotMatch(f.status.textContent,/4-2-8|建物名/);
 }finally{await f.w.happyDOM.close();}
});
test('journal UI does not announce saving success when the server refuses the write',async()=>{
 const f=await domFixture([stay],403);try{assert.equal(f.status.querySelector('a'),null);assert.doesNotMatch(f.status.textContent,/件保存しました/);}finally{await f.w.happyDOM.close();}
});
test('archive uses the stay representative anchor instead of its first raw fix',async()=>{
 const f=fixture();try{
  f.sql.exec(`CREATE TABLE member_location_history(id INTEGER PRIMARY KEY,family_id INTEGER,member_id INTEGER,latitude REAL,longitude REAL,accuracy_meters REAL,recorded_at TEXT);
  INSERT INTO member_location_history VALUES(1,1,1,35,139,5,'2026-01-02T01:00:00.000Z'),(2,1,1,35.001,139.001,5,'2026-01-02T01:10:00.000Z');
  CREATE UNIQUE INDEX archive_day_key ON location_history_archive_days(family_id,member_id,local_date);
  ALTER TABLE location_history_archive_days ADD COLUMN started_at TEXT;ALTER TABLE location_history_archive_days ADD COLUMN ended_at TEXT;ALTER TABLE location_history_archive_days ADD COLUMN raw_point_count INTEGER;ALTER TABLE location_history_archive_days ADD COLUMN route_json TEXT;ALTER TABLE location_history_archive_days ADD COLUMN archived_at TEXT;`);
  f.db.batch=statements=>Promise.all(statements.map(stmt=>stmt.run()));
  const scope=vm.createContext({module:{exports:{}},exports:{},readKnownLocationPlaces:async()=>[],locationDistance:()=>0,buildLocationStayReport:points=>[{kind:'STAY',from:points[0].recordedAt,to:points[1].recordedAt,minutes:10,place:'未登録地点付近',anchor:{latitude:35.0005,longitude:139.0005}}]});scope.exports=scope.module.exports;vm.runInContext(await compile('src/location-history-archive.ts'),scope);
  assert.equal(await vm.runInContext('archiveOneDay',scope)(f.db,{family_id:1,member_id:1,local_date:'2026-01-02'}),true);
  const row=f.sql.prepare("SELECT anchor_latitude,anchor_longitude FROM location_history_stays WHERE local_date='2026-01-02'").get();assert.equal(row.anchor_latitude,35.0005);assert.equal(row.anchor_longitude,139.0005);
 }finally{f.sql.close();}
});
