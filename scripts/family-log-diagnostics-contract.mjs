import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';

const source=fs.readFileSync('src/family-log-diagnostics.ts','utf8');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE families(id INTEGER PRIMARY KEY); INSERT INTO families VALUES(1),(2)');
db.exec(fs.readFileSync('migrations/0068_family_log_diagnostics.sql','utf8'));
const statements=[],pending=[];
let failStorage=false;
const D1={prepare(sql){
  if(failStorage)throw new Error('PRIVATE_STORAGE_ERROR');
  return {bind(...args){return {
    async run(){statements.push({sql,args});return db.prepare(sql).run(...args);},
    async all(){return {results:db.prepare(sql).all(...args)};}
  };},async run(){return db.prepare(sql).run();}};
}};
class AuthRequired extends Error{}class Forbidden extends Error{}class BadRequest extends Error{}
const context=vm.createContext({Date,WeakMap,Set,JSON,Number,Request,Response,AuthRequired,Forbidden,BadRequest,json:(data,status=200)=>Response.json(data,{status})});
const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''),{mode:'strip'}).replace(/export /g,'');
vm.runInContext(js+';globalThis.api={safeFamilyLogEvidence,withFamilyLogDiagnostic,familyLogStage,readFamilyLogDiagnostics,cleanupFamilyLogDiagnostics};',context);
const api=context.api;
const id='12345678-1234-4123-8123-123456789abc';
const request=()=>new Request('https://example.test/api/family-log',{method:'POST',headers:{'X-Family-Log-Trace':id}});
const ctx=(family=1,role='OWNER')=>({member:{family_id:family,role},env:{DB:D1},executionContext:{waitUntil(p){pending.push(p);}}});
const flush=async()=>{await Promise.all(pending.splice(0));};
const success=ctx(),response=Response.json({ok:true});
assert.equal(await api.withFamilyLogDiagnostic(request(),success,async()=>{
  api.familyLogStage(success,'CSRF_CHECK');api.familyLogStage(success,'CSRF_OK');
  api.familyLogStage(success,'DB_WRITE');api.familyLogStage(success,'DB_OK');return response;
}),response,'diagnostics must return the identical canonical response');
await flush();
let row=db.prepare('SELECT * FROM family_log_diagnostics WHERE family_id=1').get();
assert.equal(JSON.parse(row.events_json).at(-1).stage,'RESPONSE_READY');
assert.ok(JSON.parse(row.events_json).some(e=>e.stage==='DB_OK'));
// Exercise the real SQLite upsert out-of-order: stale snapshots must not erase DB_OK.
const first=statements.find(s=>s.sql.startsWith('INSERT'));
db.prepare(first.sql).run(...first.args);
assert.equal(db.prepare('SELECT revision FROM family_log_diagnostics WHERE family_id=1').get().revision,row.revision);
const readRequest=new Request('https://example.test/api/settings/diagnostics-detail?issue=family_log_quick');
assert.equal((await (await api.readFamilyLogDiagnostics(readRequest,ctx(2))).json()).items.length,0,'tenant isolation');
assert.equal((await api.readFamilyLogDiagnostics(readRequest,{...ctx(),member:null})).status,401);
assert.equal((await api.readFamilyLogDiagnostics(readRequest,ctx(1,'MEMBER'))).status,403);
assert.equal((await api.readFamilyLogDiagnostics(request(),ctx())).status,405);
for(const [role,member,header] of [['MEMBER',true,true],['OWNER',false,true],['OWNER',true,false]]){
  const before=statements.length,c=ctx(1,role);if(!member)c.member=null;
  const r=header?request():new Request('https://example.test/api/family-log',{method:'POST'});
  assert.equal(await api.withFamilyLogDiagnostic(r,c,async()=>response),response);await flush();assert.equal(statements.length,before);
}
for(const [stage,error,reason] of [['CSRF_CHECK',new Forbidden('SECRET'),'CSRF_DENIED'],['VALIDATION',new BadRequest('PRIVATE_TEXT'),'VALIDATION_DENIED'],['DB_WRITE',new Error('SECRET_SQL'),'EXCEPTION']]){
  db.exec('DELETE FROM family_log_diagnostics');const c=ctx();
  await assert.rejects(()=>api.withFamilyLogDiagnostic(request(),c,async()=>{api.familyLogStage(c,stage);throw error;}),e=>e===error);
  await flush();const events=JSON.parse(db.prepare('SELECT events_json FROM family_log_diagnostics').get().events_json);
  assert.equal(events.at(-1).reason,reason);assert.ok(!JSON.stringify(events).includes(error.message));
}
failStorage=true;
assert.equal(await api.withFamilyLogDiagnostic(request(),ctx(),async()=>response),response,'storage failure is non-authoritative');
assert.equal((await api.readFamilyLogDiagnostics(readRequest,ctx())).status,503);failStorage=false;
const safe=JSON.stringify(api.safeFamilyLogEvidence([{stage:'DB_OK',ms:4,prompt:'SECRET',latitude:35.1,token:'SECRET',reason:'SECRET'},{stage:'SECRET',ms:0}]));
assert.equal(safe,'[{"stage":"DB_OK","ms":4}]');
db.exec("INSERT INTO family_log_diagnostics VALUES(2,'expired',1,datetime('now','-2 days'),'[]')");
await api.cleanupFamilyLogDiagnostics({DB:D1});assert.equal(db.prepare("SELECT COUNT(*) c FROM family_log_diagnostics WHERE correlation_id='expired'").get().c,0);

const recorder=fs.readFileSync('public/assets/family-log-diagnostics.js','utf8');
const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const core=fs.readFileSync('public/assets/family-log-core.js','utf8');
const post=core.slice(core.indexOf('  async function post('),core.indexOf('  function setSubjectTypes'));
const quick=core.slice(core.indexOf("  document.querySelectorAll('.family-log-quick-action')"),core.indexOf("  document.querySelectorAll('.family-log-form-action')"));
const oneTap=core.slice(core.indexOf("  document.querySelectorAll('.family-log-one-tap')"),core.indexOf("  document.querySelectorAll('.family-log-row')"));
function browser(fetcher,{saved,storageFails=false,uiFails=false,selector='.family-log-one-tap',pwaOrder='none'}={}){
  let text=saved||JSON.stringify({scope:'1',expires:Date.now()+600000,armed:true,tapped:false,reload:false,started:Date.now(),id:null,events:[]});
  const listeners={},timers=[];let handler,fetchCount=0,reloads=0;
  class Element{closest(){return this;}}
  const button=new Element();Object.assign(button,{disabled:false,dataset:{subjectId:'1',quickKey:'PEE',quickActionId:'3'},setAttribute(){},removeAttribute(){},addEventListener(type,fn){handler=fn;}});
  const sandbox={Date,Set,JSON,Number,Element,crypto:{randomUUID:()=>id},sessionStorage:{getItem(){if(storageFails)throw Error('storage');return text;},setItem(k,v){if(storageFails)throw Error('storage');text=v;},removeItem(){text='null';}},
    document:{currentScript:{dataset:{family:'1'}},getElementById:()=>null,querySelector:()=>null,head:{append(){}},addEventListener(type,fn){listeners[type]=fn;},querySelectorAll:q=>q===selector?[button]:[],createElement:()=>({dataset:{},remove(){}}),body:{append(){if(uiFails)throw new TypeError('PRIVATE UI');}}},
    navigator:{},MutationObserver:class{observe(){}},
    location:{reload(){reloads++;}},alert(){},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},addEventListener(type,fn){listeners[type]=fn;},
    fetch:async(...args)=>{fetchCount++;return fetcher(...args);}};
  sandbox.window=sandbox;const c=vm.createContext(sandbox);vm.runInContext(recorder,c);
  button.cloneNode=()=>{throw new Error('PWA must not replace the canonical quick control');};
  if(pwaOrder==='before')vm.runInContext(pwa,c);
  vm.runInContext("const csrf='SECRET';"+post+quick+oneTap,c);
  if(pwaOrder==='after')vm.runInContext(pwa,c);
  return {c,button,timers,listeners,get text(){return text;},get count(){return fetchCount;},get reloads(){return reloads;},tap(){listeners.click?.({target:button});return handler();},events(){return JSON.parse(text)?.events||[];}};
}
for(const selector of ['.family-log-one-tap','.family-log-quick-action'])for(const pwaOrder of ['before','after']){
  const b=browser(async(url,options)=>{assert.equal(url,'/api/family-log');assert.equal(options.headers['X-Family-Log-Trace'],id);return Response.json({ok:true,message:'PRIVATE MESSAGE'});},{selector,pwaOrder});
  await b.tap();await b.tap();assert.equal(b.count,1,'disabled tap must not resubmit');
  assert.ok(b.events().some(e=>e.stage==='UI_UPDATE_DONE'));assert.ok(b.events().some(e=>e.stage==='REQUEST_SETTLED'));
  b.timers.find(t=>t.ms===900||t.ms===1100).fn();assert.equal(b.reloads,1);
  const next=browser(async()=>{throw Error('no fetch');},{saved:b.text});next.c.familyLogDiagnostic.ready();
  assert.ok(next.events().some(e=>e.stage==='RELOAD_BOOTSTRAP_READY'));
  assert.ok(!b.text.includes('PRIVATE')&&!b.text.includes('SECRET'));
}
for(const [fetcher,stage] of [[async()=>{throw new TypeError('PRIVATE NETWORK');},'NETWORK_ERROR'],[async()=>new Response('invalid json'),'PARSE_FAILED'],[async()=>Response.json({ok:false,error:'PRIVATE ERROR'},{status:403}),'PARSE_OK']]){
  const b=browser(fetcher);await b.tap();assert.equal(b.button.disabled,false);assert.equal(b.count,1);
  assert.ok(b.events().some(e=>e.stage===stage));assert.ok(b.events().some(e=>e.stage==='BUTTON_ENABLED'));assert.ok(!b.text.includes('PRIVATE'));
}
const ui=browser(async()=>Response.json({ok:true}),{uiFails:true});await assert.rejects(()=>ui.tap());
ui.listeners.unhandledrejection({reason:new TypeError('PRIVATE UI')});
assert.equal(ui.button.disabled,true,'diagnostics do not conceal an existing recovery-path exception');assert.ok(ui.events().some(e=>e.stage==='UI_UPDATE_START'));assert.ok(!ui.events().some(e=>e.stage==='UI_UPDATE_DONE'));assert.ok(ui.events().some(e=>e.stage==='UNHANDLED_REJECTION'));assert.ok(!ui.text.includes('PRIVATE'));
const pendingRequest=browser(()=>new Promise(()=>{}));void pendingRequest.tap();await Promise.resolve();
pendingRequest.timers.find(t=>t.ms===15000).fn();assert.equal(pendingRequest.count,1);assert.equal(pendingRequest.button.disabled,true,'observer must not retry/re-enable an uncertain mutation');assert.ok(pendingRequest.events().some(e=>e.stage==='PENDING_15S'));
const missing=browser(async()=>Response.json({ok:true}));missing.listeners.click({target:missing.button});missing.timers.find(t=>t.ms===1000).fn();assert.ok(missing.events().some(e=>e.stage==='HANDLER_NOT_OBSERVED'));
const form=browser(async()=>{throw Error('form open must not save');});
let formClick;form.c.document.querySelectorAll=()=>[{dataset:{},addEventListener(type,fn){formClick=fn;}}];
form.c.openNew=()=>{};form.c.formField=()=>({value:''});form.c.refreshDynamicFields=()=>{};
vm.runInContext(core.slice(core.indexOf("  document.querySelectorAll('.family-log-form-action')"),core.indexOf("  document.querySelectorAll('.family-log-one-tap')")),form.c);
form.listeners.click({target:form.button});formClick();assert.equal(form.count,0);assert.ok(form.events().some(e=>e.stage==='EDITOR_READY'));
const deniedStorage=browser(async()=>Response.json({ok:true}),{storageFails:true});await deniedStorage.tap();assert.equal(deniedStorage.count,1);
assert.ok(!recorder.includes('console.')&&!source.includes('console.'),'no raw console logging');
assert.ok(!core.includes('AbortController'),'no speculative mutation timeout');
const loader=fs.readFileSync('public/assets/family-log.js','utf8'),loads=[];
vm.runInNewContext(loader.slice(loader.indexOf('let coreStarted=false;'),loader.lastIndexOf('})();')),{window:{},syncBabyFoodFields(){},load(...args){loads.push(args);}});
assert.equal(loads.length,1);loads[0][2]();loads[0][1]();
assert.equal(loads.filter(x=>x[0].includes('family-log-core')).length,1,'optional photo error must start core exactly once');
console.log('Family Log one-shot diagnostics: success/failure, pending observation, UI recovery, no retry, auth/CSRF, tenant/privacy, monotonic evidence and retention ok');
