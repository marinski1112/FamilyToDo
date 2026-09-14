import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync('src/child-food-list.ts','utf8');
const exports={};
class AuthRequired extends Error{};class Forbidden extends Error{};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name)=>name==='./errors'?{AuthRequired,Forbidden}:name==='./response'?{html:(body,status=200)=>new Response(body,{status}),redirect:(url,status)=>new Response(null,{status,headers:{Location:url}})}:name==='./app-shell'?{layout:(_,body)=>body}:{familyDate:()=> '2026-09-14',familyNow:()=> '2026-09-14 10:00:00',DEFAULT_FAMILY_TIMEZONE:'Asia/Tokyo'},FormData,Response,Request,URL,crypto,Date});
const form=(values)=>{const f=new FormData();for(const [k,v] of Object.entries(values))for(const item of Array.isArray(v)?v:[v])f.append(k,item);return f;};
assert.equal(exports.parseChildFood(form({name:' にんじん ',stage:['1','1','4']}),'2026-09-14').mask,5);
for(const values of [{name:''},{name:'a',first_tried_on:'2026-02-30'},{name:'a',first_tried_on:'2027-01-01'},{name:'a',stage:'16'},{name:'a',category:'BAD'}])assert.equal(exports.parseChildFood(form(values),'2026-09-14'),null);
let writes=[];
const db={prepare(sql){
 let args;
 return {
  bind(...a){args=a;return this;},
  async first(){return sql.includes('sqlite_master')?{name:'child_food_entries'}:null;},
  async all(){return {results:sql.includes('family_log_subjects')?[{id:2,name:'child'}]:[]};},
  async run(){writes.push({sql,args});return {meta:{changes:1,last_row_id:10}};}
 };
}};
const context={member:{id:1,family_id:1},session:{csrfToken:'test'},env:{DB:db}};
const request=(values)=>new Request('https://test/app/child_foods.php',{method:'POST',body:form(values)});
await assert.rejects(()=>exports.childFoodListPage(request({subject_id:'2',csrf:'bad'}),context),Forbidden);
assert.equal(writes.length,0);
assert.equal((await exports.childFoodListPage(request({subject_id:'99',csrf:'test'}),context)).status,404);assert.equal(writes.length,0);
assert.equal((await exports.childFoodListPage(request({subject_id:'2',csrf:'test',action:'stage',id:'10',bit:'1',value:'1'}),context)).status,303);
assert.equal(JSON.stringify(writes[0].args.slice(-3)),JSON.stringify([10,1,2]));
assert.match(writes[0].sql,/WHERE id=\? AND family_id=\? AND subject_id=\?/);
const result=spawnSync('python3',['-c',`
import sqlite3,json,sys
p=json.load(sys.stdin);d=sqlite3.connect(':memory:');d.executescript('CREATE TABLE families(id INTEGER PRIMARY KEY); CREATE TABLE family_log_subjects(id INTEGER PRIMARY KEY);');d.executescript(p['migration'])
d.execute("INSERT INTO child_food_entries(family_id,subject_id,name,name_key,category,created_at,updated_at) VALUES(1,2,'米','米','GRAIN','now','now')")
for _ in range(2):d.execute(p['sql'],(1,1,1,'now',1,1,2))
assert d.execute('SELECT stage_mask FROM child_food_entries').fetchone()[0]==1
assert d.execute(p['sql'],(0,1,1,'now',1,9,2)).rowcount==0
try:d.execute("INSERT INTO child_food_entries(family_id,subject_id,name,name_key,created_at,updated_at) VALUES(1,2,'米','米','now','now')");raise AssertionError('duplicate accepted')
except sqlite3.IntegrityError:pass
print('SQL duplicate, tenant scope and replay-safe stage PASS')
`],{input:JSON.stringify({migration:fs.readFileSync('migrations/0081_child_food_list.sql','utf8'),sql:writes[0].sql}),encoding:'utf8'});
assert.equal(result.status,0,result.stderr);process.stdout.write(result.stdout);
console.log('Child food validation, CSRF, subject isolation PASS');
