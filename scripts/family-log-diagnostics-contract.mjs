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
const shell=fs.readFileSync('src/app-shell.ts','utf8');
for(const marker of ['GENERIC_QUICK_TAP','MODAL_NOT_OPEN','MODAL_OPEN','MODAL_SHEET_MISSING','MODAL_SHEET_ZERO_RECT','MODAL_SHEET_OUTSIDE_VIEWPORT','MODAL_HITTEST_BLOCKED','MODAL_READY','elementFromPoint','保存前の入力画面経路（POSTなし）'])assert.ok(recorder.includes(marker),`child quick modal diagnostic marker missing: ${marker}`);
assert.ok(recorder.includes(".family-log-quick[data-log-type]"),'fallback child quick buttons must be observed by one-shot diagnostics');
assert.ok(recorder.includes("getStorage('localStorage')"),'client evidence must have a same-origin persistence fallback');
assert.ok(recorder.includes('最大10分だけ退避'),'diagnostics UI must describe bounded client evidence retention');
assert.ok(shell.includes('family-log-diagnostics.js?v=${APP_VERSION}-quick-client-persist1'),'Family Log diagnostics persistence asset must be cache-busted through the canonical app shell');
const post=core.slice(core.indexOf('  async function post('),core.indexOf('  function setSubjectTypes'));
const quick=core.slice(core.indexOf("  document.querySelectorAll('.family-log-quick-action')"),core.indexOf("  document.querySelectorAll('.family-log-form-action')"));
const oneTap=core.slice(core.indexOf("  document.querySelectorAll('.family-log-one-tap')"),core.indexOf("  document.querySelectorAll('.family-log-row')"));
function browser(fetcher,{saved,persistentSaved,storageFails=false,sessionStorageFails=false,localStorageFails=false,uiFails=false,selector='.family-log-one-tap',pwaOrder='none',scope='1'}={}){
  const initial=JSON.stringify({scope,expires:Date.now()+600000,armed:true,tapped:false,reload:false,started:Date.now(),updated:Date.now(),id:null,events:[]});
  let sessionText=saved===undefined?initial:saved,localText=persistentSaved===undefined?(saved===undefined?initial:saved):persistentSaved;
  const listeners={},timers=[];let handler,fetchCount=0,reloads=0;
  class Element{closest(){return this;}}
  const button=new Element();Object.assign(button,{disabled:false,dataset:{subjectId:'1',quickKey:'PEE',quickActionId:'3'},setAttribute(){},removeAttribute(){},addEventListener(type,fn){handler=fn;}});
  const storage=(kind)=>({
    getItem(){if(storageFails||(kind==='session'&&sessionStorageFails)||(kind==='local'&&localStorageFails))throw Error('storage');return kind==='session'?sessionText:localText;},
    setItem(k,v){if(storageFails||(kind==='session'&&sessionStorageFails)||(kind==='local'&&localStorageFails))throw Error('storage');if(kind==='session')sessionText=v;else localText=v;},
    removeItem(){if(kind==='session')sessionText='null';else localText='null';}
  });
  const sandbox={Date,Set,JSON,Number,Element,crypto:{randomUUID:()=>id},sessionStorage:storage('session'),localStorage:storage('local'),
    document:{currentScript:{dataset:{family:scope}},documentElement:{clientWidth:390,clientHeight:844},getElementById:()=>null,querySelector:()=>null,elementFromPoint:()=>null,head:{append(){}},addEventListener(type,fn){listeners[type]=fn;},querySelectorAll:q=>q===selector?[button]:[],createElement:()=>({dataset:{},remove(){}}),body:{append(){if(uiFails)throw new TypeError('PRIVATE UI');}}},
    navigator:{},MutationObserver:class{observe(){}},innerWidth:390,innerHeight:844,
    location:{reload(){reloads++;}},alert(){},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},addEventListener(type,fn){listeners[type]=fn;},
    fetch:async(...args)=>{fetchCount++;return fetcher(...args);}};
  sandbox.window=sandbox;const c=vm.createContext(sandbox);vm.runInContext(recorder,c);
  button.cloneNode=()=>{throw new Error('PWA must not replace the canonical quick control');};
  if(pwaOrder==='before')vm.runInContext(pwa,c);
  vm.runInContext("const csrf='SECRET';"+post+quick+oneTap,c);
  if(pwaOrder==='after')vm.runInContext(pwa,c);
  const evidence=()=>{
    const candidates=[];
    for(const text of [sessionText,localText]){
      try{const parsed=JSON.parse(text);if(parsed?.scope===scope&&Array.isArray(parsed.events))candidates.push(parsed);}catch{}
    }
    candidates.sort((a,b)=>(Number(b.updated)||Number(b.started)||0)-(Number(a.updated)||Number(a.started)||0)||b.events.length-a.events.length);
    return candidates[0]?.events||[];
  };
  return {c,button,timers,listeners,get text(){return sessionText;},get persistentText(){return localText;},get count(){return fetchCount;},get reloads(){return reloads;},tap(){listeners.click?.({target:button});return handler();},events:evidence};
}
for(const selector of ['.family-log-one-tap','.family-log-quick-action'])for(const pwaOrder of ['before','after']){
  const b=browser(async(url,options)=>{assert.equal(url,'/api/family-log');assert.equal(options.headers['X-Family-Log-Trace'],id);return Response.json({ok:true,message:'PRIVATE MESSAGE'});},{selector,pwaOrder});
  await b.tap();await b.tap();assert.equal(b.count,1,'disabled tap must not resubmit');
  assert.ok(b.events().some(e=>e.stage==='UI_UPDATE_DONE'));assert.ok(b.events().some(e=>e.stage==='REQUEST_SETTLED'));
  b.timers.find(t=>t.ms===900||t.ms===1100).fn();assert.equal(b.reloads,1);
  const next=browser(async()=>{throw Error('no fetch');},{saved:b.text,persistentSaved:b.persistentText});next.c.familyLogDiagnostic.ready();
  assert.ok(next.events().some(e=>e.stage==='RELOAD_BOOTSTRAP_READY'));
  assert.ok(!b.text.includes('PRIVATE')&&!b.text.includes('SECRET')&&!b.persistentText.includes('PRIVATE')&&!b.persistentText.includes('SECRET'));
}
for(const [fetcher,stage] of [[async()=>{throw new TypeError('PRIVATE NETWORK');},'NETWORK_ERROR'],[async()=>new Response('invalid json'),'PARSE_FAILED'],[async()=>Response.json({ok:false,error:'PRIVATE ERROR'},{status:403}),'PARSE_OK']]){
  const b=browser(fetcher);await b.tap();assert.equal(b.button.disabled,false);assert.equal(b.count,1);
  assert.ok(b.events().some(e=>e.stage===stage));assert.ok(b.events().some(e=>e.stage==='BUTTON_ENABLED'));assert.ok(!b.text.includes('PRIVATE')&&!b.persistentText.includes('PRIVATE'));
}
const ui=browser(async()=>Response.json({ok:true}),{uiFails:true});await assert.rejects(()=>ui.tap());
ui.listeners.unhandledrejection({reason:new TypeError('PRIVATE UI')});
assert.equal(ui.button.disabled,true,'diagnostics do not conceal an existing recovery-path exception');assert.ok(ui.events().some(e=>e.stage==='UI_UPDATE_START'));assert.ok(!ui.events().some(e=>e.stage==='UI_UPDATE_DONE'));assert.ok(ui.events().some(e=>e.stage==='UNHANDLED_REJECTION'));assert.ok(!ui.text.includes('PRIVATE')&&!ui.persistentText.includes('PRIVATE'));
const pendingRequest=browser(()=>new Promise(()=>{}));void pendingRequest.tap();await Promise.resolve();
pendingRequest.timers.find(t=>t.ms===15000).fn();assert.equal(pendingRequest.count,1);assert.equal(pendingRequest.button.disabled,true,'observer must not retry/re-enable an uncertain mutation');assert.ok(pendingRequest.events().some(e=>e.stage==='PENDING_15S'));
const missing=browser(async()=>Response.json({ok:true}));missing.listeners.click({target:missing.button});missing.timers.find(t=>t.ms===1000).fn();assert.ok(missing.events().some(e=>e.stage==='HANDLER_NOT_OBSERVED'));
const form=browser(async()=>{throw Error('form open must not save');});
let formClick;form.c.document.querySelectorAll=()=>[{dataset:{},addEventListener(type,fn){formClick=fn;}}];
form.c.openNew=()=>{};form.c.formField=()=>({value:''});form.c.refreshDynamicFields=()=>{};
vm.runInContext(core.slice(core.indexOf("  document.querySelectorAll('.family-log-form-action')"),core.indexOf("  document.querySelectorAll('.family-log-one-tap')")),form.c);
form.listeners.click({target:form.button});formClick();assert.equal(form.count,0);assert.ok(form.events().some(e=>e.stage==='EDITOR_READY'));
const persistentSource=browser(async()=>Response.json({ok:true}));await persistentSource.tap();
const recovered=browser(async()=>{throw Error('no second mutation');},{saved:'null',persistentSaved:persistentSource.persistentText});
assert.ok(recovered.events().some(e=>e.stage==='RESPONSE_RECEIVED'),'client response evidence must survive loss of sessionStorage context');
assert.ok(recovered.events().some(e=>e.stage==='REQUEST_SETTLED'),'settled evidence must survive loss of sessionStorage context');
assert.equal(recovered.count,0,'recovering evidence must never retry a mutation');
const localOnly=browser(async()=>Response.json({ok:true}),{sessionStorageFails:true});await localOnly.tap();assert.equal(localOnly.count,1);assert.ok(localOnly.events().some(e=>e.stage==='UI_UPDATE_DONE'),'local fallback must observe client recovery when session storage is unavailable');
const foreign=JSON.stringify({scope:'2',expires:Date.now()+600000,armed:false,tapped:true,reload:false,started:Date.now(),updated:Date.now(),id,events:[{stage:'RESPONSE_RECEIVED',ms:1,status:200}]});
const scoped=browser(async()=>Response.json({ok:true}),{saved:'null',persistentSaved:foreign,scope:'1'});assert.equal(scoped.c.familyLogDiagnostic,undefined,'persistent evidence from another family scope must not be restored');
const deniedStorage=browser(async()=>Response.json({ok:true}),{storageFails:true});await deniedStorage.tap();assert.equal(deniedStorage.count,1);
assert.ok(!recorder.includes('console.')&&!source.includes('console.'),'no raw console logging');
assert.ok(!core.includes('AbortController'),'no speculative mutation timeout');
const loader=fs.readFileSync('public/assets/family-log.js','utf8'),loads=[];
vm.runInNewContext(loader.slice(loader.indexOf('let coreStarted=false;'),loader.lastIndexOf('})();')),{window:{},syncBabyFoodFields(){},load(...args){loads.push(args);}});
assert.equal(loads.length,1);loads[0][2]();loads[0][1]();
assert.equal(loads.filter(x=>x[0].includes('family-log-core')).length,1,'optional photo error must start core exactly once');
console.log('Family Log one-shot diagnostics: success/failure, pending observation, child quick modal visibility/hit-test, LIFF client evidence persistence, UI recovery, no retry, auth/CSRF, tenant/privacy, monotonic evidence and retention ok');
