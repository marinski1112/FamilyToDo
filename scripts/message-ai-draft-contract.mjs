import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
let transpile;try{const ts=require('typescript');transpile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}catch{const {stripTypeScriptTypes}=await import('node:module');transpile=stripTypeScriptTypes;}
const code=path=>transpile(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,''));
const original='明日は遠足なので、お弁当と水筒を用意してください。';
let message={id:1,text:original,created_at:'2026-09-05 18:00:00',updated_at:'2026-09-05 18:00:00'},candidateRows=[{id:11,title:'遠足の準備',task_date:'2026-09-06'}],calls=0,reserved=[],budget=true,responseStatus=200,prompt='',modelResult;
const queries=[];
const db={prepare(sql){let args;return{bind(...values){args=values;return this;},async first(){queries.push({sql,args});return message;},async all(){queries.push({sql,args});return{results:candidateRows};}};}};
const item=(text,title,extra={})=>({sourceIndex:0,originalText:text,title,quantity:null,category:null,dueDate:null,dueTime:null,description:null,...extra});
modelResult={items:[item(original,'遠足の持ち物を準備',{dueDate:'2026-09-06',description:'お弁当と水筒を用意する'})],suggestedTaskId:11};
const context=vm.createContext({Request,Response,URL,console,
  json:(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers}),
  familyAiProvider:()=> 'GEMINI',familyDate:()=> '2026-09-07',DEFAULT_FAMILY_TIMEZONE:'Asia/Tokyo',
  SHOPPING_CATEGORY_MAX_LENGTH:255,resolveShoppingCategoryOptions:()=>[],shoppingCategoryKey:x=>String(x).toLowerCase(),
  reserveTaskRoughInputAiRequest:async(_db,_family,date)=>{reserved.push(date);return budget;},blockTaskRoughInputAiAfter429:async()=>{},
  geminiFetch:async(_env,_model,body)=>{calls++;prompt=body.contents[0].parts[0].text;return{ok:responseStatus===200,status:responseStatus,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(modelResult)}]}}]})};},
});
vm.runInContext(code('src/task-rough-input-api.ts')+'\n'+code('src/message-ai-draft.ts'),context);
const ctx={env:{DB:db,GEMINI_API_KEY:'fixture'},member:{id:1,family_id:42,family_timezone:'Asia/Tokyo'},session:{csrfToken:'fixture'}};
const draft=await (await context.messageAiDraft(ctx,1)).json();
assert.equal(draft.suggestedTaskId,11);assert.equal(draft.item.title,'遠足の持ち物を準備');assert.equal(draft.originalText,original);
assert.equal(draft.referenceDate,'2026-09-05');assert.ok(prompt.includes('relativeDateBase=2026-09-05'));assert.deepEqual(reserved,['2026-09-07'],'budgets use the current day, not the old message day');assert.equal(calls,1);
assert.equal(draft.requiresConfirmation,true);assert.ok(!queries.some(q=>/INSERT|UPDATE|DELETE/.test(q.sql)),'draft must not mutate tasks/messages');
assert.equal(context.messageTaskSimilarity('9/6 お願いします','9/6 病院'),0,'a date/request phrase alone must not match');
modelResult.suggestedTaskId=999;candidateRows=[{id:12,title:'車の点検',task_date:'2026-09-06'}];
assert.equal((await (await context.messageAiDraft(ctx,1)).json()).suggestedTaskId,null,'unlisted model IDs never reach conversion');
const before=calls;message=null;assert.equal((await context.messageAiDraft(ctx,999)).status,404);assert.equal(calls,before);
message={id:1,text:'スタンプ',created_at:'2026-09-05'};assert.equal((await context.messageAiDraft(ctx,1)).status,400);assert.equal(calls,before);
message={id:1,text:original,created_at:'2026-09-05',converted_to_task_id:11};assert.equal((await (await context.messageAiDraft(ctx,1)).json()).already,true);assert.equal(calls,before);
assert.equal((await context.taskRoughInputApi(new Request('https://example.invalid',{method:'POST',body:'{}'}),{...ctx,session:{}})).status,403);
const prose=context.parseRequestBody({primaryType:'task',summarize:true,fields:[{destination:'task',text:'買い物の準備\nお弁当と水筒\n前夜に確認'}]});assert.equal(prose.fields[0].blocks.length,1);
const list=context.parseRequestBody({primaryType:'task',fields:[{destination:'task',text:'掃除\n洗濯'}]});assert.equal(list.fields[0].blocks.length,2);
assert.equal(context.needsModel(context.parseRequestBody({primaryType:'shopping',fields:[{destination:'shopping',text:'牛乳'}]}).fields),false);
assert.equal(context.needsModel(context.parseRequestBody({primaryType:'task',fields:[{destination:'task',text:'忘れずに書類を確認してください'}]}).fields),true);
const fields=context.parseRequestBody({primaryType:'shopping',fields:[{destination:'shopping',text:'牛乳2本'}]}).fields;
const validate=items=>context.validateGeminiItems({items},fields,new Map());
assert.equal(validate([item('牛乳2本','牛乳',{quantity:'3本'})]).reasonCode,'QUANTITY_PROVENANCE_INVALID','invented quantity rejected');
assert.equal(validate([item('牛乳2本','牛乳',{dueDate:'2026-09-08'})]).reasonCode,'DATE_PROVENANCE_INVALID','invented date rejected');
assert.equal(validate([item('牛乳2本','牛乳',{dueTime:'12:00'})]).reasonCode,'FIELD_VALUE_INVALID','time requires a date');
assert.equal(validate([item('牛乳2本','牛乳'),item('牛乳2本','牛乳')]).reasonCode,'DUPLICATE_ITEM_OVERFLOW','duplicated draft rows rejected');
assert.equal(validate([item('牛乳2本','牛乳',{quantity:{value:2}})]).reasonCode,'ITEM_VALUE_TYPE_INVALID','non-scalar output rejected');
assert.equal(validate([item('牛乳2本','牛乳',{quantity:'2本'})]).items.length,1);
for(const phrase of ['3日後','３日後','2週間後','二日後','1ヶ月後']){
  const original='提出\n期限: '+phrase;
  const input=context.parseRequestBody({primaryType:'task',summarize:true,fields:[{destination:'task',text:original}]}).fields;
  assert.equal(context.needsModel(input),true,phrase+' must reach the model');
  assert.equal(context.validateGeminiItems({items:[item(original,'提出',{dueDate:'2026-09-10'})]},input,new Map()).items.length,1,phrase+' must not reject a resolved date');
}
assert.equal(vm.runInContext("temporalIntentHint('牛乳3本')",context),false);
budget=false;let count=calls;const fallback=await (await context.analyzeTaskRoughInput(ctx,{primaryType:'task',summarize:true,fields:[{destination:'task',text:original}]})).json();assert.equal(fallback.reason,'BUDGET');assert.equal(calls,count);
budget=true;responseStatus=429;await context.analyzeTaskRoughInput(ctx,{primaryType:'task',summarize:true,fields:[{destination:'task',text:original}]});assert.equal(calls,count+1,'429 must stop the fallback model');
responseStatus=200;modelResult={items:[]};count=calls;await context.analyzeTaskRoughInput(ctx,{primaryType:'task',summarize:true,fields:[{destination:'task',text:original}]});assert.equal(calls,count+2,'at most primary + fallback attempts');
// The exact candidate query must omit private/other-family/completed/template rows.
const query=queries.find(q=>q.sql.startsWith('SELECT t.id,t.title'));
const sqlite=spawnSync('python3',['-c',`
import sqlite3,json,sys
q=json.load(sys.stdin);db=sqlite3.connect(':memory:')
db.executescript('CREATE TABLE tasks(id INTEGER,family_id INTEGER,title TEXT,visibility_scope TEXT,status TEXT,task_kind TEXT,start_at TEXT,due_at TEXT,end_at TEXT,created_at TEXT); CREATE TABLE recurrence_rules(family_id INTEGER,task_id INTEGER);')
rows=[(11,42,'遠足','FAMILY','pending','TASK','2026-09-06',None,None,'2026-09-01'),(12,42,'非公開','PRIVATE','pending','TASK','2026-09-06',None,None,'2026-09-01'),(13,99,'別家族','FAMILY','pending','TASK','2026-09-06',None,None,'2026-09-01'),(14,42,'完了','FAMILY','completed','TASK','2026-09-06',None,None,'2026-09-01'),(15,42,'定期','FAMILY','pending','TASK','2026-09-06',None,None,'2026-09-01'),(16,42,'遠い予定','FAMILY','pending','TASK','2027-09-06',None,None,'2026-09-01')]
db.executemany('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?)',rows);db.execute('INSERT INTO recurrence_rules VALUES(42,15)')
assert [r[0] for r in db.execute(q['sql'],q['args'])]==[11]
`],{input:JSON.stringify(query),encoding:'utf8'});assert.equal(sqlite.status,0,sqlite.stderr);

// Execute the real browser request handler to prove cancelled/edited forms are not overwritten.
const client=fs.readFileSync('public/assets/messages-ai-ui.js','utf8');
let resolveResponse;const status={textContent:''},retry={},submit={},control={},state={};
const browserContext=vm.createContext({generation:0,controller:null,dirty:false,applying:false,status,retry,submit,cache:new Map(),csrf:'fixture',AbortController,
  taskForm:{elements:control,dataset:state},modal:{classList:{contains:()=>true}},select:{},setMode:()=>{},setTimeout:()=>1,clearTimeout:()=>{},
  fetch:()=>new Promise(resolve=>{resolveResponse=resolve;}),
});
browserContext.cancel=()=>{browserContext.generation++;browserContext.controller?.abort();};
vm.runInContext(client.slice(client.indexOf('  async function analyze('),client.indexOf('  let currentButton=')),browserContext);
const button={dataset:{id:'1',text:original}};
let pending=browserContext.analyze(button);browserContext.dirty=true;resolveResponse({ok:true,json:async()=>draft});await pending;
assert.ok(status.textContent.includes('入力を変更'));assert.equal(Object.keys(control).length,0);assert.equal(submit.disabled,false);
pending=browserContext.analyze(button,true);browserContext.generation++;const oldStatus=status.textContent;resolveResponse({ok:true,json:async()=>draft});await pending;assert.equal(status.textContent,oldStatus);
state.saving='1';const guardedStatus=status.textContent;await browserContext.analyze(button,true);assert.equal(status.textContent,guardedStatus,'analysis cannot restart during a save');
console.log('message AI: actual analysis, bounded calls, reference date, candidate privacy, quantity/date validation and stale UI responses passed');
await import('./rough-input-save-state-contract.mjs');