import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {spawnSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8');
const load=(path,names,extra={})=>{
  const source=stripTypeScriptTypes(read(path),{mode:'strip'}).replace(/^import .*;\s*$/gm,'').replace(/\bexport /g,'');
  const context={...extra};vm.runInNewContext(source+';this.result={'+names.join(',')+'};',context);return context.result;
};
const {placePresence,buildLocationStayReport}=load('src/location-stay-report.ts',['placePresence','buildLocationStayReport']);
const {arrivalDecision}=load('src/location-arrival-push.ts',['arrivalDecision']);
const time=m=>new Date(Date.UTC(2026,0,1,0,m)).toISOString();
const place={key:'H:1',label:'自宅',latitude:0,longitude:0,accuracyMeters:10,version:'1'};
const point=(minute,longitude=0,accuracyMeters=10)=>({latitude:0,longitude,accuracyMeters,recordedAt:time(minute)});
assert.equal(placePresence(point(0),place),'IN');assert.equal(placePresence(point(0,.01),place),'OUT');assert.equal(placePresence(point(0,0,200),place),'UNKNOWN');
assert.equal(placePresence({...point(0),accuracyMeters:undefined},place),'UNKNOWN');
let report=buildLocationStayReport([point(0),point(5),point(10),point(20,.01),point(80,.01)],[place]);
assert.equal(report[0].kind,'STAY');assert.equal(report[0].minutes,10);assert.equal(report[0].place,'自宅');assert.equal(report[1].kind,'MOVE');assert.equal(report[2].kind,'GAP');
assert.equal(buildLocationStayReport([point(0,0,200),point(5,.001,200)],[])[0].kind,'UNCERTAIN');
assert.ok(!JSON.stringify(report).includes('latitude')&&!JSON.stringify(report).includes('longitude'));
const old={place_version:'1',recorded_at:time(0),state:'OUT',pending_since:null,last_arrival_at:null};
assert.equal(arrivalDecision(null,'IN','1',time(0)).notify,false,'initial inside is baseline');
assert.equal(arrivalDecision(old,'IN','1',time(1)).notify,false,'first inside sample only starts confirmation');
const pending={...old,recorded_at:time(1),pending_since:time(1)};
assert.equal(arrivalDecision(pending,'IN','1',time(2)).notify,true);
assert.equal(arrivalDecision(pending,'UNKNOWN','1',time(2)),null);
assert.equal(arrivalDecision(pending,'IN','1',time(1)),null,'replay/out-of-order ignored');
assert.equal(arrivalDecision(pending,'IN','2',time(2)).notify,false,'place reset is baseline');
assert.equal(arrivalDecision(pending,'IN','1',time(40)).notify,false,'long gap cannot imply arrival');
assert.equal(arrivalDecision({...pending,last_arrival_at:time(0)},'IN','1',time(2)).notify,false,'jitter cooldown');
const sender=read('src/location-arrival-push.ts'),api=read('src/location-places-api.ts'),ingress=read('src/location-owntracks-ingress.ts');
assert.ok(sender.includes('current.recordedAt!==point.recordedAt'));assert.ok(sender.includes('AND recorded_at=? AND place_version=?'));
assert.ok(sender.indexOf('INSERT OR IGNORE INTO location_arrival_deliveries')<sender.indexOf('await sendMemberWebPush'));
assert.ok(sender.includes('recipient.member_id')&&sender.includes('enabled=1'));
assert.ok(ingress.indexOf('if(!persisted)return unauthorized();')<ingress.indexOf('execution.waitUntil'));
assert.ok(ingress.includes('processLocationArrival(env,normalized.point).catch(()=>{})'));
assert.ok(api.includes('constantTimeEqual')&&api.includes("['OWNER','ADMIN']")&&api.includes('size>2048'));
const {locationPlacesApi}=load('src/location-places-api.ts',['locationPlacesApi'],{json:(body,status)=>({body,status}),constantTimeEqual:(a,b)=>a===b});
assert.equal((await locationPlacesApi({method:'GET'},{member:null})).status,401);
const denied={member:{id:1,family_id:1},session:{csrfToken:'expected'},env:{DB:{prepare:()=>({bind:()=>({first:async()=>null})})}}};
assert.equal((await locationPlacesApi({method:'GET'},denied)).status,403);
denied.env.DB.prepare=()=>({bind:()=>({first:async()=>({role:'MEMBER'})})});
assert.equal((await locationPlacesApi({method:'POST',headers:{get:()=>''}},denied)).status,403,'CSRF denial precedes mutation');
for(const source of [sender,api])assert.doesNotMatch(source,/console\.|JSON\.stringify\(point|GEMINI|generateContent/);
const sql=spawnSync('python3',['-c',`
import sqlite3,sys
d=sqlite3.connect(':memory:');d.executescript('CREATE TABLE families(id INTEGER PRIMARY KEY);CREATE TABLE members(id INTEGER PRIMARY KEY);INSERT INTO families VALUES(1);INSERT INTO members VALUES(1),(2);')
d.executescript(sys.stdin.read())
q="INSERT OR IGNORE INTO location_arrival_deliveries(family_id,member_id,recipient_id,place_key,recorded_at,status) VALUES(1,1,2,'H:1','2026-01-01T00:00:00.000Z','ATTEMPTED')"
d.execute(q);d.execute(q);assert d.execute('SELECT COUNT(*) FROM location_arrival_deliveries').fetchone()[0]==1
d.execute("INSERT INTO location_arrival_states VALUES(1,1,'H:1','1','old','OUT',NULL,NULL)")
q="UPDATE location_arrival_states SET recorded_at='new',state='IN' WHERE family_id=1 AND member_id=1 AND place_key='H:1' AND recorded_at='old' AND place_version='1'"
assert d.execute(q).rowcount==1;assert d.execute(q).rowcount==0
`],{input:read('migrations/0069_location_places_arrival.sql'),encoding:'utf8'});assert.equal(sql.status,0,sql.stderr);
console.log('location report/arrival: observed stays, gaps, uncertainty, first baseline, two-point confirmation, replay/CAS, cooldown, tenant/CSRF wiring, no AI calls ok');
