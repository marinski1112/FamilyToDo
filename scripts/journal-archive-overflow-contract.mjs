import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {transform} from 'esbuild';

const source=fs.readFileSync('src/location-history-archive.ts','utf8');
const compiled=await transform(source.replace(/^import .*;\n/gm,''),{loader:'ts',format:'cjs'});
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE member_location_history(id INTEGER PRIMARY KEY,family_id INTEGER,member_id INTEGER,latitude REAL,longitude REAL,accuracy_meters REAL,recorded_at TEXT);
CREATE TABLE location_history_archive_days(family_id INTEGER,member_id INTEGER,local_date TEXT,started_at TEXT,ended_at TEXT,raw_point_count INTEGER,route_point_count INTEGER,route_json TEXT,archived_at TEXT,PRIMARY KEY(family_id,member_id,local_date));
CREATE TABLE location_history_stays(id INTEGER PRIMARY KEY AUTOINCREMENT,family_id INTEGER,member_id INTEGER,local_date TEXT,started_at TEXT,ended_at TEXT,minutes INTEGER,place_label TEXT,anchor_latitude REAL,anchor_longitude REAL,created_at TEXT);`);
db.exec(fs.readFileSync('migrations/0107_location_archive_scan_cursor.sql','utf8'));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const archiveDate=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const insert=db.prepare('INSERT INTO member_location_history(family_id,member_id,latitude,longitude,accuracy_meters,recorded_at) VALUES(1,1,35,139,5,?)');
for(let i=0;i<2672;i++)insert.run(new Date(Date.parse(archiveDate+'T00:00:00+09:00')+i*25000).toISOString());
const adapter={prepare(sql){let stmt=db.prepare(sql),args=[];return {bind(...values){args=values;return this;},async all(){return {results:stmt.all(...args)};},async first(){return stmt.get(...args)||null;},async run(){const info=stmt.run(...args);return {meta:{changes:Number(info.changes)}};}};},async batch(statements){return Promise.all(statements.map(stmt=>stmt.run()));}};
const context=vm.createContext({module:{exports:{}},exports:{},readKnownLocationPlaces:async()=>[],buildLocationStayReport:()=>[],locationDistance:()=>0});context.exports=context.module.exports;
vm.runInContext(compiled.code,context);
// Candidate selection must include the previously rejected full family/day.
const archived=await context.module.exports.archiveLocationHistory({DB:adapter});
assert.equal(archived.length,1);
const row=db.prepare('SELECT raw_point_count,route_point_count FROM location_history_archive_days WHERE family_id=1 AND local_date=?').get(archiveDate);
assert.equal(row.raw_point_count,2672);
assert.ok(row.route_point_count>=1&&row.route_point_count<=72);
assert.equal((await context.module.exports.archiveLocationHistory({DB:adapter})).length,0,'already archived day stays stable after temporary repair removal');
db.close();
console.log('journal archive overflow: full 2672-point day is archived once and remains stable');
