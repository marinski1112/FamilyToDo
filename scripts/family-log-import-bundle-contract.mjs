import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'import-bundle-')),dbfile=path.join(dir,'test.db');
const python=`import json,sqlite3,sys
p=json.load(sys.stdin);d=sqlite3.connect(p['db']);d.row_factory=sqlite3.Row;d.execute('PRAGMA foreign_keys=ON');out=[]
try:
 for q in p['queries']:
  if 'script' in q:d.executescript(q['script']);continue
  c=d.execute(q['sql'],q.get('args',[]));rows=[dict(r) for r in c.fetchall()] if c.description else []
  out.append({'results':rows,'meta':{'changes':max(0,c.rowcount),'last_row_id':c.lastrowid}})
 d.commit();print(json.dumps(out))
except Exception:
 d.rollback();raise
`;
function execute(queries){const r=spawnSync('python3',['-c',python],{input:JSON.stringify({db:dbfile,queries}),encoding:'utf8'});if(r.status)throw new Error(r.stderr);return JSON.parse(r.stdout);}
const DB={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async first(){return execute([this])[0].results[0]||null;},async all(){return execute([this])[0];},async run(){return execute([this])[0];}};},async batch(q){return execute(q);}};
const cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);if(name==='./app-shell')return {layout:(_,body)=>body};if(name==='./response')return {json:(d,status=200)=>new Response(JSON.stringify(d),{status}),html:(body,status=200)=>new Response(body,{status}),redirect:(url,status=303)=>new Response(null,{status,headers:{Location:url}})};
 const filename='src/'+name.slice(2)+(name.endsWith('.js')?'':'.ts'),exports={};cache.set(name,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:load,Request,Response,FormData,URL,crypto,TextEncoder,Uint8Array,Date,Intl,setTimeout,clearTimeout,console},{filename});return exports;
}
try{
 execute([{script:fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync('migrations/'+n,'utf8')).join('\n')}]);
 execute([{script:`INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'a','a','x','x'),(2,'b','b','x','x');
 INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,1,'a','a','OWNER',1,'x','x'),(2,2,'b','b','OWNER',1,'x','x');
 INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_at,updated_at) VALUES(10,1,'child','BABY',1,'x','x'),(20,2,'other','CHILD',1,'x','x');`}]);
 const ctx={member:{id:1,family_id:1,role:'OWNER',family_timezone:'Asia/Tokyo'},session:{csrfToken:'test'},env:{DB}};
 const api=load('./family-log-import').familyLogImportApi;
 const call=async(b,context=ctx)=>{const r=await api(new Request('https://test/api/family-log-import',{method:'POST',body:JSON.stringify({csrf:'test',...b})}),context);assert.equal(r.status,200);return r.json();};
 const records=[{external_id:'memo-1',occurred_at:'2025-09-01T12:00:00+09:00',log_type:'MEMO',detail_code:'JOURNAL_MEMO',journal:true,value_text:'笑った',note:'日記'}, {external_id:'meal-1',occurred_at:'2025-09-01T13:00:00+09:00',log_type:'MEAL',detail_code:'BABY_FOOD',value_text:'米'}];
 const document={format:'familytodo-family-log-import-v1',source:'piyolog',records};
 await assert.rejects(()=>call({action:'preview',subject_id:20,document}));
 await assert.rejects(()=>call({action:'preview',subject_id:10,document,csrf:''}));
 await assert.rejects(()=>call({action:'preview',subject_id:10,document},{...ctx,member:{...ctx.member,role:'MEMBER'}}));
 const preview=await call({action:'preview',subject_id:10,document});assert.equal(preview.new_count,2);
 const bad=await call({action:'preview',subject_id:10,document:{...document,records:[{...records[0],amount:1}]}});assert.equal(bad.error_count,1);
 const started=await call({action:'start',subject_id:10,document});
 await call({action:'chunk',batch_id:started.batch_id,offset:0,records});
 await call({action:'chunk',batch_id:started.batch_id,offset:0,records});
 assert.equal((await call({action:'finish',batch_id:started.batch_id})).imported_count,2);
 assert.equal(execute([{sql:'SELECT * FROM family_log_journal_entries'}])[0].results.length,1);
 assert.equal(execute([{sql:'SELECT * FROM child_journal_calendar_outbox'}])[0].results.length,0,'historical import must not schedule Google writes');
 assert.equal((await call({action:'preview',subject_id:10,document})).duplicate_count,2);
 const targetApi=load('./family-log-import-media-targets').familyLogImportMediaTargetsApi;
 const targets=await (await targetApi(new Request('https://test/api/family-log-import-media-targets',{method:'POST',body:JSON.stringify({csrf:'test',subject_id:10,action:'media_targets',external_ids:['memo-1','meal-1']})}),ctx)).json();assert.equal(targets.targets.length,2);
 const foods=[{name:'米',category:'GRAIN',first_tried_on:'2025-08-01',stages:['INITIAL','MIDDLE']}];
 assert.equal((await call({action:'foods_preview',subject_id:10,foods})).new_count,1);
 assert.equal((await call({action:'foods_apply',subject_id:10,foods})).added,1);
 assert.equal((await call({action:'foods_apply',subject_id:10,foods:[{...foods[0],stages:['COMPLETE']}]})).added,0);
 assert.equal(execute([{sql:'SELECT stage_mask FROM child_food_entries'}])[0].results[0].stage_mask,3);
 await assert.rejects(()=>call({action:'foods_apply',subject_id:20,foods}));
 await assert.rejects(()=>call({action:'foods_apply',subject_id:10,foods:[{...foods[0],first_tried_on:'2025-02-30'}]}));
 // Existing synced journals enqueue deletion; pending photos remain durable.
 execute([{sql:'UPDATE family_log_journal_entries SET google_sync_enabled=1'},{sql:"INSERT INTO family_log_media(family_id,log_id,subject_id,storage_key,mime_type,byte_size,created_by,created_at) VALUES(1,1,10,'synthetic-test-only','image/jpeg',10,1,'x')"}]);
 const diaryModule=load('./imported-family-diary');
 const beforeRead=execute([{sql:'SELECT * FROM family_logs'},{sql:'SELECT * FROM family_log_media'}]);
 const diary=await diaryModule.importedFamilyDiary(DB,1,'2025-09','2025-10-01','',1);
 assert.equal(diary.counts.get('2025-09-01'),1);assert.match(diary.html,/笑った/);assert.match(diary.html,/media=1/);
 assert.ok(!(await diaryModule.importedFamilyDiary(DB,2,'2025-09','2025-10-01','',1)).html.includes('笑った'));
 assert.ok(!(await diaryModule.importedFamilyDiary(DB,1,'2025-09','2025-10-01','2025-09-02',1)).html.includes('笑った'));
 const ordinary=execute([{sql:`SELECT l.import_external_id FROM family_logs l WHERE l.family_id=1 AND l.deleted_at IS NULL AND NOT ${diaryModule.IMPORTED_FAMILY_DIARY_SQL}`}])[0].results;
 assert.equal(ordinary.length,1);assert.equal(ordinary[0].import_external_id,'meal-1');
 assert.deepEqual(execute([{sql:'SELECT * FROM family_logs'},{sql:'SELECT * FROM family_log_media'}]),beforeRead,'destination routing must not mutate content or photo IDs');
 const reset=await call({action:'reset_preview',subject_id:10});
 execute([{sql:"INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,created_at,updated_at) VALUES(1,10,'MEMO','2025-09-02','x','x'),(2,20,'MEMO','2025-09-02','x','x')"}]);
 await assert.rejects(()=>call({...reset,action:'reset_apply',subject_id:10,confirmation:'wrong',delete_foods:false}));
 const resetArgs={...reset,action:'reset_apply',subject_id:10,confirmation:'childの全ログを削除',delete_foods:false};
 assert.equal((await call(resetArgs)).remaining,0);assert.equal((await call(resetArgs)).remaining,0);
 assert.equal(execute([{sql:'SELECT id FROM family_logs WHERE deleted_at IS NULL'}])[0].results.length,2,'later records and other family survive');
 assert.equal(execute([{sql:'SELECT reconcile_pending FROM family_log_media'}])[0].results[0].reconcile_pending,1);
 assert.equal(execute([{sql:'SELECT operation FROM child_journal_calendar_outbox'}])[0].results[0].operation,'DELETE');
 assert.equal(execute([{sql:'SELECT id FROM child_food_entries'}])[0].results.length,1);
 await assert.rejects(()=>call({action:'chunk',batch_id:started.batch_id,offset:0,records}));
 assert.equal((await call({action:'preview',subject_id:10,document})).new_count,2,'reset permits reimport');
 await call({...resetArgs,delete_foods:true});assert.equal(execute([{sql:'SELECT id FROM child_food_entries'}])[0].results.length,0);
 // More than one reset request is required; batch metadata must remain nonterminal until the immutable cutoff is empty.
 const manyBatch=execute([{sql:"INSERT INTO family_log_import_batches(family_id,subject_id,source,source_hash,record_count,imported_count,skipped_count,error_count,created_by,created_at,status,processed_count,chunk_manifest_json) VALUES(1,10,'piyolog','reset-many',105,105,0,0,1,'x','COMPLETED',105,'[]')"}])[0].meta.last_row_id;
 execute([{sql:`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<105) INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,created_at,updated_at,import_batch_id) SELECT 1,10,'MEMO','2025-09-02','x','x',${manyBatch} FROM n`}]);
 const many=await call({action:'reset_preview',subject_id:10});
 const manyArgs={...many,action:'reset_apply',subject_id:10,confirmation:'childの全ログを削除',delete_foods:false};
 const firstMany=await call(manyArgs);assert.equal(firstMany.remaining,6);
 const rolling=execute([{sql:'SELECT status,rolled_back_at FROM family_log_import_batches WHERE id=?',args:[manyBatch]},{sql:'SELECT COUNT(*) count FROM family_logs WHERE import_batch_id=? AND deleted_at IS NULL',args:[manyBatch]}]);
 assert.equal(rolling[0].results[0].status,'ROLLING_BACK');assert.equal(rolling[0].results[0].rolled_back_at,null);assert.equal(rolling[1].results[0].count,6,'partial reset must retain active rows while metadata is nonterminal');
 await assert.rejects(()=>call({action:'rollback',batch_id:manyBatch}),'per-import rollback must not compete with an in-progress full reset');
 assert.equal((await call(manyArgs)).remaining,0);
 const rolled=execute([{sql:'SELECT status,rolled_back_at FROM family_log_import_batches WHERE id=?',args:[manyBatch]}])[0].results[0];
 assert.equal(rolled.status,'ROLLED_BACK');assert.ok(rolled.rolled_back_at,'terminal rollback metadata is written only after the reset cutoff is empty');
 // Simulate a partial reset between a chunk's pre-read and its atomic batch write.
 const laterRecords=[{...records[1],external_id:'later',occurred_at:'2025-09-03T12:00:00+09:00'}];
 const later=await call({action:'start',subject_id:10,document:{...document,records:laterRecords}});
 execute([{sql:"WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<101) INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,created_at,updated_at) SELECT 1,10,'MEMO','2025-09-03','x','x' FROM n"}]);
 const snapshot=await call({action:'reset_preview',subject_id:10});
 const snapshotArgs={...snapshot,action:'reset_apply',subject_id:10,confirmation:'childの全ログを削除',delete_foods:false};
 const originalBatch=DB.batch;let raced=false;
 DB.batch=async q=>{if(!raced){raced=true;DB.batch=originalBatch;const partial=await call(snapshotArgs);assert.equal(partial.remaining,1);}return execute(q);};
 await assert.rejects(()=>call({action:'chunk',batch_id:later.batch_id,offset:0,records:laterRecords}));
 const fenced=execute([{sql:'SELECT status,rolled_back_at FROM family_log_import_batches WHERE id=?',args:[later.batch_id]},{sql:'SELECT COUNT(*) count FROM family_logs WHERE family_id=1 AND subject_id=10 AND deleted_at IS NULL'}]);
 assert.equal(fenced[0].results[0].status,'ROLLING_BACK');assert.equal(fenced[0].results[0].rolled_back_at,null);assert.equal(fenced[1].results[0].count,1);
 await assert.rejects(()=>call({action:'chunk',batch_id:later.batch_id,offset:0,records:laterRecords}));
 assert.equal((await call(snapshotArgs)).remaining,0);
 const retired=execute([{sql:'SELECT status,rolled_back_at FROM family_log_import_batches WHERE id=?',args:[later.batch_id]},{sql:'SELECT id FROM family_logs WHERE family_id=1 AND deleted_at IS NULL'}]);
 assert.equal(retired[0].results[0].status,'ROLLED_BACK');assert.ok(retired[0].results[0].rolled_back_at);assert.equal(retired[1].results.length,0,'retired in-flight chunk must not resurrect data');
 console.log('bundle API + all migrations: journal canonical storage, photo targets, food idempotency, auth/CSRF/tenant, reset cutoff, cleanup/outbox, reimport PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
