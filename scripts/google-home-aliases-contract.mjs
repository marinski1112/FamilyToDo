import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync('src/google-home-aliases.ts','utf8');
const ctx={html:(body,status=200)=>({body,status}),redirect:url=>({url,status:302}),Date,URL};vm.createContext(ctx);
vm.runInContext(stripTypeScriptTypes(source).replace(/^import .*;$/gm,'').replace(/export /g,'')+'\nthis.validate=validateHomeAliases;this.merge=mergeHomeAliases;this.save=saveHomeAliases;this.editor=homeAliasEditor;',ctx);
const scenes=[{id:'ft:chore:1',name:{name:'ワイパー完了',nicknames:['ワイパーを完了']}},{id:'ft:chore:2',name:{name:'掃除完了',nicknames:['掃除を完了']}}];
const normalized=v=>JSON.parse(JSON.stringify(v));
assert.deepEqual(normalized(ctx.validate(scenes,'ft:chore:1','ワイパーかけたよ\nワイパーしたよ')),['ワイパーかけたよ','ワイパーしたよ']);
assert.deepEqual(normalized(ctx.validate(scenes,'ft:chore:1','')),[]);
assert.throws(()=>ctx.validate(scenes,'other-family-id','test'));
assert.throws(()=>ctx.validate(scenes,'ft:chore:1','掃 除完了'));
assert.throws(()=>ctx.validate(scenes,'ft:chore:1','a\nb\nc\nd'));
assert.throws(()=>ctx.validate(scenes,'ft:chore:1','OK Google ワイパー'));
assert.throws(()=>ctx.validate(scenes,'ft:chore:1','<script>'));
assert.throws(()=>ctx.validate(scenes,'ft:chore:1','あ'.repeat(61)));
const rows=[{scene_id:'ft:chore:1',phrase:'ワイパーしたよ',phrase_key:'ワイパーしたよ'},{scene_id:'ft:chore:1',phrase:'掃除完了',phrase_key:'掃除完了'},{scene_id:'removed',phrase:'なくなった操作',phrase_key:'なくなった操作'}];
const merged=ctx.merge(scenes,rows);
assert.deepEqual(normalized(merged[0].name.nicknames),['ワイパーを完了','ワイパーしたよ']);
assert.equal(scenes[0].name.nicknames.length,1,'must not mutate base catalog');
let batches=[];
const DB={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){return {results:rows};}};},async batch(ss){batches.push(ss);return [];}};
const base={env:{DB},member:{id:1,family_id:2,role:'ADMIN'},session:{csrfToken:'test'},request:new Request('https://example.test/app/settings_google_home.php?edit_scene=ft:chore:1')};
assert.equal((await ctx.save({...base,member:{...base.member,role:'MEMBER'}},{},scenes)).status,403);
assert.equal(batches.length,0);
assert.equal((await ctx.save(base,{scene_id:'other-family',aliases:'test'},scenes)).status,400);
assert.equal(batches.length,0);
assert.equal((await ctx.save(base,{scene_id:'ft:chore:1',aliases:'ワイパーしたよ'},scenes)).status,302);
assert.deepEqual(batches[0][0].args,[2,'ft:chore:1']);
assert.deepEqual(batches[0][1].args.slice(0,5),[2,'ft:chore:1','ワイパーしたよ','ワイパーしたよ',1]);
assert.equal(await ctx.editor({...base,member:{...base.member,role:'MEMBER'}},scenes),'');
const rendered=await ctx.editor(base,scenes);
assert.match(rendered,/name="csrf"/);assert.match(rendered,/標準の言い方/);assert.match(rendered,/公開されない言い方/);
const home=fs.readFileSync('src/google-home.ts','utf8');
const handler=home.slice(home.indexOf('export async function googleHomeSettings'));
assert.ok(handler.indexOf('CSRF検証に失敗')<handler.indexOf("input.action==='save_aliases'"));
assert.ok(home.includes('return includeCustom?mergeHomeAliases(scenes,await readHomeAliases(env,familyId).catch(()=>[])):scenes;'));
assert.ok(!source.includes('fetch('),'alias save/render must not call Google');
// Unique family/phrase key rejects conflicting writers and rolls back a prior deletion.
const py=`import sqlite3,json,sys
c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
c.executescript('CREATE TABLE families(id INTEGER PRIMARY KEY); CREATE TABLE members(id INTEGER PRIMARY KEY); INSERT INTO families VALUES(1),(2); INSERT INTO members VALUES(1);')
c.executescript(sys.stdin.read())
c.execute("INSERT INTO google_home_aliases VALUES(1,'a','one','one',1,'now')")
c.execute("INSERT INTO google_home_aliases VALUES(1,'b','two','two',1,'now')")
c.commit()
try:
 with c:
  c.execute("DELETE FROM google_home_aliases WHERE family_id=1 AND scene_id='a'")
  c.execute("INSERT INTO google_home_aliases VALUES(1,'a','two','two',1,'now')")
except sqlite3.IntegrityError: pass
assert c.execute("SELECT COUNT(*) FROM google_home_aliases WHERE scene_id='a'").fetchone()[0]==1
c.execute("INSERT INTO google_home_aliases VALUES(2,'a','one','one',1,'now')")
`;
const result=spawnSync('python3',['-c',py],{input:fs.readFileSync('migrations/0071_google_home_aliases.sql','utf8'),encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
console.log('google-home-aliases: bounds/collisions, baseline preservation, admin/CSRF, family isolation and atomic replacement OK');
