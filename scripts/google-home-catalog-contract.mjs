import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildSync} from 'esbuild';

const directory=mkdtempSync(join(tmpdir(),'familytodo-home-catalog-'));
const database=new DatabaseSync(':memory:');
try{
  const bundle=join(directory,'home.mjs');
  buildSync({
    stdin:{contents:"export {googleFulfillment,googleHomeSettings} from './src/google-home'; export {resolveHomeSceneNames,homeSceneNameConflicts,mergeHomeAliases,aliasKey} from './src/google-home-aliases';",resolveDir:resolve('.'),loader:'ts'},
    bundle:true,platform:'node',format:'esm',outfile:bundle,
  });
  const {googleFulfillment,googleHomeSettings,resolveHomeSceneNames,homeSceneNameConflicts,mergeHomeAliases,aliasKey}=await import(pathToFileURL(bundle).href);
  const uniquePhrases=scenes=>{
    const owners=new Map();
    for(const s of scenes)for(const phrase of [s.name.name,...s.name.nicknames]){
      const key=aliasKey(phrase);
      assert.ok(!owners.has(key)||owners.get(key)===s.id,`ambiguous phrase: ${phrase}`);
      owners.set(key,s.id);
    }
  };
  const raw=[
    {id:'ft:log:wet:1:now',name:{name:'おしっこ記録',nicknames:['おしっこを記録','排尿記録']}},
    {id:'ft:flquick:1',name:{name:'おしっこ記録',nicknames:['おしっこ','おしっこを記録']}},
    {id:'ft:baby:milk:1:240',name:{name:'赤ちゃんミルク240記録',nicknames:['赤ちゃんのミルク240','ミルク240飲んだよ']}},
    {id:'ft:flquick:2',name:{name:'ミルク240飲んだよ記録',nicknames:['ミルク240飲んだよ']}},
    {id:'ft:chore:1',name:{name:'掃除完了',nicknames:['掃除を完了']}},
  ];
  const snapshot=structuredClone(raw),resolved=resolveHomeSceneNames(raw);
  assert.deepEqual(raw,snapshot,'catalog resolution must not mutate the source');
  uniquePhrases(resolved);
  assert.deepEqual(resolved.map(s=>s.id),raw.map(s=>s.id),'Scene IDs must be retained');
  assert.deepEqual(resolveHomeSceneNames(resolved),resolved,'resolution must be idempotent');
  assert.deepEqual(resolveHomeSceneNames([...raw].reverse()).reverse(),resolved,'input order must not change resolved names');
  assert.deepEqual(resolved.at(-1),raw.at(-1),'unambiguous chore names must be unchanged');
  assert.ok(homeSceneNameConflicts(raw).some(row=>row.phrase==='ミルク240飲んだよ'));
  const withExplicitAlias=mergeHomeAliases(raw,[{scene_id:'ft:flquick:2',phrase:'ミルク240飲んだよ',phrase_key:'ミルク240飲んだよ'}]);
  uniquePhrases(withExplicitAlias);
  assert.ok(withExplicitAlias.find(s=>s.id==='ft:flquick:2').name.nicknames.includes('ミルク240飲んだよ'),'explicit saved alias must stay on its selected operation');
  assert.ok(!withExplicitAlias.find(s=>s.id==='ft:baby:milk:1:240').name.nicknames.includes('ミルク240飲んだよ'));

  // Normalization, truncation, and generated suffixes must not create new ambiguity.
  const edge=[
    {id:'a',name:{name:'Ａ 操作',nicknames:['済んだ','a 操作']}},
    {id:'b',name:{name:'a操作',nicknames:['済 んだ']}},
    {id:'c',name:{name:'Ａ 操作（操作1）',nicknames:[]}},
    ...['d','e'].map(id=>({id,name:{name:'記'.repeat(60),nicknames:[]}})),
  ];
  const normalized=resolveHomeSceneNames(edge);uniquePhrases(normalized);
  assert.ok(normalized.every(s=>Array.from(s.name.name).length<=60));
  assert.equal(normalized.find(s=>s.id==='c').name.name,edge[2].name.name);

  for(const file of readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort())database.exec(readFileSync(join('migrations',file),'utf8'));
  const DB={
    prepare(sql){let args=[];return {
      bind(...values){args=values;return this;},
      async first(){return database.prepare(sql).get(...args)||null;},
      async all(){return {results:database.prepare(sql).all(...args)};},
      async run(){const result=database.prepare(sql).run(...args);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},
    };},
  };
  database.exec(`
    INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'HOME_TEST','Home test','now','now');
    INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,1,'home-test','Owner','OWNER',1,'now','now');
    INSERT INTO family_log_subjects(id,family_id,name,subject_kind,created_at,updated_at) VALUES(1,1,'赤ちゃん','BABY','now','now');
    INSERT INTO family_quick_chores(id,family_id,name,created_by,created_at,updated_at) VALUES(1,1,'掃除',1,'now','now');
    INSERT INTO family_log_quick_actions(id,family_id,subject_id,name,mode,log_type,detail_code,amount,unit,created_at,updated_at) VALUES
      (1,1,1,'おしっこ','QUICK','DIAPER','WET',NULL,NULL,'now','now'),
      (2,1,1,'ミルク240飲んだよ','QUICK','MILK',NULL,240,'ml','now','now');
    INSERT INTO google_home_aliases VALUES
      (1,'ft:flquick:2','ミルク240飲んだよ','ミルク240飲んだよ',1,'now'),
      (1,'ft:log:wet:1:now','おしっこしたよ','おしっこしたよ',1,'now'),
      (1,'ft:chore:1','掃除したよ','掃除したよ',1,'now');
  `);
  const token='local-google-home-test-token';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=Buffer.from(digest).toString('hex');
  database.prepare('INSERT INTO google_home_tokens(family_id,member_id,access_token_hash,refresh_token_hash,access_expires_at,created_at,updated_at) VALUES(1,1,?,?,?,\'now\',\'now\')').run(hash,'local-test-refresh-hash',Math.floor(Date.now()/1000)+3600);
  const env={DB,APP_TIMEZONE:'Asia/Tokyo'};
  const fulfill=async(intent,payload={},requestId=crypto.randomUUID())=>{
    const response=await googleFulfillment(new Request('https://example.test/api/google-home/fulfillment',{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({requestId,inputs:[{intent,payload}]}),
    }),env);
    assert.equal(response.status,200);return response.json();
  };
  const synced=(await fulfill('action.devices.SYNC')).payload.devices;
  uniquePhrases(synced);
  assert.ok(synced.every(s=>Object.keys(s).sort().join(',')==='attributes,id,name,traits,type,willReportState'),'diagnostic fields must not leak into SYNC');
  for(const phrase of ['ミルク240飲んだよ','おしっこしたよ','掃除したよ']){
    const operation=synced.find(s=>[s.name.name,...s.name.nicknames].includes(phrase));assert.ok(operation,phrase);
    const response=await fulfill('action.devices.EXECUTE',{commands:[{devices:[{id:operation.id}],execution:[{command:'action.devices.commands.ActivateScene',params:{deactivate:false}}]}]});
    assert.equal(response.payload.commands[0].status,'SUCCESS',phrase);
  }
  assert.equal(database.prepare("SELECT COUNT(*) n FROM family_logs WHERE log_type='MILK' AND amount=240 AND subject_id=1").get().n,1);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM family_logs WHERE log_type='DIAPER' AND detail_code='WET' AND subject_id=1").get().n,1);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM family_logs WHERE log_type='HOUSEWORK' AND quick_chore_id=1").get().n,1);

  // A retry while the original request is still processing must not claim it recorded a log.
  const payload={commands:[{devices:[{id:'ft:log:wet:1:now'}],execution:[{command:'action.devices.commands.ActivateScene',params:{deactivate:false}}]}]};
  database.exec("INSERT INTO external_command_receipts(provider,family_id,member_id,request_id,command_key,status,created_at,updated_at) VALUES('GOOGLE_HOME',1,1,'pending-test','ft:log:wet:1:now:activate','PENDING','now','now')");
  const before=database.prepare('SELECT COUNT(*) n FROM family_logs').get().n;
  const pending=await fulfill('action.devices.EXECUTE',payload,'pending-test');
  assert.equal(pending.payload.commands[0].status,'ERROR');
  assert.equal(pending.payload.commands[0].errorCode,'hardError');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM family_logs').get().n,before);
  assert.equal(database.prepare("SELECT status FROM external_command_receipts WHERE request_id='pending-test'").get().status,'PENDING','retry must not change the in-flight receipt');
  await fulfill('action.devices.EXECUTE',payload,'completed-test');
  const completedCount=database.prepare('SELECT COUNT(*) n FROM family_logs').get().n;
  const replay=await fulfill('action.devices.EXECUTE',payload,'completed-test');
  assert.equal(replay.payload.commands[0].status,'SUCCESS');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM family_logs').get().n,completedCount,'successful replay must not record twice');

  const page=await googleHomeSettings(new Request('https://example.test/app/settings_google_home.php?edit_scene=ft:log:wet:1:now'),{
    env,member:{id:1,family_id:1,name:'Owner',role:'OWNER'},session:{csrfToken:'local-test'},
    request:new Request('https://example.test/app/settings_google_home.php?edit_scene=ft:log:wet:1:now'),
  });
  const body=await page.text();assert.equal(page.status,200);
  assert.ok(body.includes('複数の操作で同じ言い方'));
  for(const s of synced)assert.ok(body.includes(s.name.name),'settings must display the same resolved names as SYNC');

  console.log('google-home-catalog: unique names/aliases, stable IDs, saved alias ownership, real SYNC/EXECUTE persistence, replay status and settings diagnostics OK');
}finally{database.close();rmSync(directory,{recursive:true,force:true});}
