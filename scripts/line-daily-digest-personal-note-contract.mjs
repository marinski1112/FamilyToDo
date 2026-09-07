import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let transpile;
try{const ts=require('typescript');transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}
catch{const {stripTypeScriptTypes}=await import('node:module');transpile=s=>stripTypeScriptTypes(s);}
const source=fs.readFileSync('src/line-daily-digest.ts','utf8');
const moduleCode=path=>transpile(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,''));
const output={recap:'家族で一緒に、気持ちのいい朝を迎えましょう。',members:[{memberId:1,note:'窓辺で一息ついてみませんか。',fortune:'青い小物が今日の相棒。笑顔のきっかけが見つかりそう。'},{memberId:2,note:'好きな音楽で気分を整えましょう。',fortune:'お気に入りのカップに幸運の予感。温かい飲み物を楽しんで。'}]};
let calls=0,stored=null,prompt='';
const context=vm.createContext({
  loadSafeFamilyAiProfileContext:async()=>[],readFinalizedMorningDigestFrame:async()=>stored,
  finalizeMorningDigestFrame:async(_db,_family,_date,raw)=>{stored=raw;},
  reserveMorningDigestAiRequest:async()=>true,blockMorningDigestAiAfter429:async()=>{},
  familyAiProvider:()=> 'GEMINI',formatMorningWeather:()=> '晴れ',
  geminiFetch:async(_env,_model,body)=>{calls++;prompt=body.contents[0].parts[0].text;return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}]})};},
  FAMILY_LOG_TYPE_META:{},console,
});
vm.runInContext(moduleCode('src/daily-fortune.ts')+'\n'+moduleCode('src/line-digest-generation.ts')+'\n'+moduleCode('src/line-daily-digest.ts'),context);
for(const text of ['一緒に一息つきましょう。','千夏さんも、自分のペースで。','一人ひとりの頑張りに拍手。'])assert.equal(context.generatedRecapPassesSafety(text,[]),true,text);
for(const text of ['三件完了です。','５回記録しました。','二つ済ませました。','三つ完了しました。','二本飲みました。','四枚片付けました。','https://evil.example','緯度を確認しました。'])assert.equal(context.generatedRecapPassesSafety(text,[]),false,text);
assert.equal(context.generatedRecapPassesSafety('隠された趣味の秘密です。',[{personality_note:'隠された趣味の秘密'}]),false);
const facts={localDate:'2026-09-08',previousDate:'2026-09-07',today:{events:[],tasks:[],bringItems:[],completed:3,incomplete:4,overdue:2},familyLog:{previous:Array(12).fill('記録'.repeat(100)),today:[]},location:{previous:[],today:[]},fortune:context.dailyFortune(42,1,'2026-09-08')};
const recipients=[{id:1,name:'A'},{id:2,name:'B'}],env={DB:{},GEMINI_API_KEY:'synthetic'};
const frame=await context.chooseFrame(env,'PLAIN',42,facts.localDate,facts,null,recipients);
assert.equal(calls,1,'one family generation must produce both personal messages');
assert.equal(frame.memberMorning.length,2);
assert.equal(JSON.parse(stored).generation.status,'AI');
assert.ok(prompt.includes('"memberId":1')&&prompt.includes('"memberId":2'));
const individual=context.renderDeterministicFacts(facts,frame,null,[recipients[0]]);
assert.ok(individual.includes(output.members[0].fortune)&&!individual.includes(output.members[1].fortune));
const shared=context.renderDeterministicFacts(facts,frame,null,recipients);
assert.ok(shared.includes(output.members[0].fortune)&&shared.includes(output.members[1].fortune));
assert.equal(shared.split(output.recap).length-1,1);
assert.ok(shared.includes('完了3・未完了4／期限切れ2件')&&shared.length<=5000);
await context.chooseFrame(env,'FRIENDLY',42,facts.localDate,facts,null,recipients);
assert.equal(calls,1,'cached personal bundle must not regenerate per destination');
const badStored=JSON.stringify({narrativeVersion:3,recap:output.recap,memberMorning:[{memberId:1,note:'https://evil.example',fortune:'危険'}]});
assert.equal(context.persistedMorningFrame(badStored,{},[]).memberMorning.length,0);
stored=null;
await context.chooseFrame({...env,GEMINI_API_KEY:''},'FRIENDLY',42,facts.localDate,facts,null,recipients);
assert.equal(JSON.parse(stored).generation.reason,'NOT_CONFIGURED');
stored=null;output.members[1].fortune='';
await context.chooseFrame(env,'FRIENDLY',42,facts.localDate,facts,null,recipients);
assert.equal(JSON.parse(stored).generation.reason,'INVALID_OUTPUT');
assert.equal(calls,3,'invalid bundle allows only the existing primary/fallback attempts');
const evidence=source.slice(source.indexOf('function morningNarrativeEvidence('),source.indexOf('\nasync function chooseFrame('));
assert.ok(!/location|latitude|longitude|private_owner_id/i.test(evidence));
assert.ok(source.includes('0,localDate,EMPTY_LOCATION_FACTS'));
assert.ok(source.includes('if(members.length===1)')&&source.includes('facts=sharedAiFacts'));
assert.equal((source.match(/geminiFetch\(env,model,body\)/g)||[]).length,1);
assert.ok(source.includes("if(!String(env.LINE_ACCESS_TOKEN||'').trim())return"));
// Execute the actual SQL against SQLite fixtures, including ranges and private tasks.
const captured=[];
const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async all(){captured.push({sql,args});return {results:[]};},async first(){captured.push({sql,args});return {};}};}};
context.recurringForFamilyRange=async()=>[{task_kind:'TASK',status:'completed',due_at:'2026-09-08',title:'定期'}];
const loaded=await context.buildFactPayload({DB:db},42,1,'2026-09-08',{previous:[],today:[]});
assert.equal(loaded.today.completed,1,'projected recurrence must contribute to totals');
const {spawnSync}=await import('node:child_process');
const sqlTest=spawnSync('python3',['-c',`
import sqlite3,json,sys
queries=json.load(sys.stdin)
db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
db.executescript('CREATE TABLE tasks(id INTEGER,family_id INTEGER,title TEXT,task_kind TEXT,status TEXT,start_at TEXT,end_at TEXT,due_at TEXT,visibility_scope TEXT,private_owner_id INTEGER); CREATE TABLE recurrence_rules(family_id INTEGER,task_id INTEGER,id INTEGER); CREATE TABLE recurrence_occurrences(family_id INTEGER,recurrence_rule_id INTEGER,exception_task_id INTEGER);')
rows=[(1,42,'期間中','TASK','pending','2026-09-06','2026-09-09',None,'FAMILY',None),(2,42,'期限切れ','TASK','pending','2026-09-01','2026-09-07',None,'FAMILY',None),(3,42,'期間イベント','EVENT','pending','2026-09-06','2026-09-09',None,'FAMILY',None),(4,42,'他人の秘密','TASK','pending','2026-09-08',None,None,'PRIVATE',2),(5,42,'定期テンプレート','TASK','pending','2026-09-08',None,None,'FAMILY',None),(6,99,'別家族','TASK','pending','2026-09-08',None,None,'FAMILY',None),(7,42,'完了','TASK','completed','2026-09-08',None,None,'FAMILY',None)]
rows += [(8,42,'変更した定期タスク','OCCURRENCE','pending','2026-09-08',None,None,'FAMILY',None),(9,42,'変更した定期イベント','OCCURRENCE','pending','2026-09-08',None,None,'FAMILY',None),(10,42,'イベントの親','EVENT','pending','2026-09-01',None,None,'FAMILY',None),(11,42,'非公開の変換分','OCCURRENCE','pending','2026-09-08',None,None,'FAMILY',None),(12,42,'元がない変換分','OCCURRENCE','pending','2026-09-08',None,None,'FAMILY',None)]
db.executemany('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?)',rows);db.execute('ALTER TABLE tasks ADD COLUMN all_day INTEGER DEFAULT 0')
db.executemany('INSERT INTO recurrence_rules VALUES(?,?,?)',[(42,5,50),(42,10,51),(42,4,52)])
db.executemany('INSERT INTO recurrence_occurrences VALUES(?,?,?)',[(42,50,8),(42,51,9),(42,52,11)])
for q in queries:
 if q['sql'].startswith('SELECT t.title'):
  actual={r['title']:r['task_kind'] for r in db.execute(q['sql'],q['args'])}
  assert actual=={'期間中':'TASK','期間イベント':'EVENT','完了':'TASK','変更した定期タスク':'TASK','変更した定期イベント':'EVENT'},actual
 elif 'SUM(CASE WHEN date(COALESCE(t.start_at' in q['sql']:
  row=db.execute(q['sql'],q['args']).fetchone();assert dict(row)=={'completed':1,'incomplete':2,'overdue':1},dict(row)
`],{input:JSON.stringify(captured),encoding:'utf8'});
assert.equal(sqlTest.status,0,sqlTest.stderr);
// Reuse the real recurrence completion projection (ALL, excluded, exception).
let occurrence={id:7,recurrence_rule_id:9,occurrence_date:'2026-09-08',status:'pending'};
const rule={id:9,task_id:5,active:1,recurrence_type:'DAILY',interval_value:1,start_date:'2026-09-08',start_at:'2026-09-08 08:00:00',task_kind:'TASK',completion_mode:'ALL'};
const recurrenceDb={prepare(sql){return {bind(){return this;},async all(){return {results:sql.startsWith('SELECT r.*')?[rule]:sql.startsWith('SELECT * FROM recurrence_occurrences')?[occurrence]:sql.startsWith('SELECT ta.task_id')?[{task_id:5,assigned_count:2}]:sql.startsWith('SELECT c.occurrence_id')?[{occurrence_id:7,c:2}]:[]};}};}};
const rc=vm.createContext({});
vm.runInContext(moduleCode('src/task-range-safety.ts')+'\n'+moduleCode('src/task-visibility.ts')+'\n'+moduleCode('src/recurrence-projection.ts'),rc);
assert.equal((await rc.recurringForFamilyRange(recurrenceDb,42,0,'2026-09-08','2026-09-08'))[0].status,'completed');
occurrence={...occurrence,status:'excluded'};
assert.equal((await rc.recurringForFamilyRange(recurrenceDb,42,0,'2026-09-08','2026-09-08')).length,0);
occurrence={...occurrence,status:'pending',exception_task_id:11};
assert.equal((await rc.recurringForFamilyRange(recurrenceDb,42,0,'2026-09-08','2026-09-08')).length,0);
await import('./line-daily-digest-weather-contract.mjs');
console.log('daily recap: personal routing/cache, bounded AI, numeric language, privacy, diagnostics and overflow ok');
