import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('src/d1-read-diagnostics.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {trackScheduledD1Reads,cleanupScheduledD1ReadDiagnostics}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const writes=[];
const prepared=[];
const db={
  prepare(sql){
    prepared.push(sql);
    return {
      bind(...values){
        if(sql.includes('d1_scheduled_read_diagnostics'))writes.push({sql,values});
        return this;
      },
      async all(){return {results:[{n:1}],meta:{rows_read:37,rows_written:0}};},
      async run(){return {meta:{rows_read:2,rows_written:1}};},
      async first(){return {n:1};},
    };
  },
  async batch(statements){return statements.map(()=>({meta:{rows_read:5,rows_written:1}}));},
};
const env={DB:db};
const tracked=trackScheduledD1Reads(env,'test_job');
assert.deepEqual(await tracked.env.DB.prepare('SELECT COUNT(*) n FROM sample').first(),{n:1});
await tracked.env.DB.prepare('UPDATE sample SET n=?').bind(1).run();
await tracked.env.DB.batch([tracked.env.DB.prepare('SELECT n FROM sample LIMIT 1')]);
await tracked.env.DB.prepare('SELECT n FROM sample').first();
await tracked.flush();
await tracked.flush();
assert.equal(writes.length,1,'flush is idempotent');
assert.deepEqual(writes[0].values.slice(1,6),['test_job',44,2,3,1]);
assert.ok(!writes[0].sql.includes('sample'),'diagnostics persist no source SQL');
await cleanupScheduledD1ReadDiagnostics(db);
assert.match(prepared.at(-1),/LIMIT 100/);
assert.match(prepared.at(-1),/strftime\('%Y-%m-%dT%H:00:00Z'/);
console.log('D1 scheduled read diagnostics: counters, batch, first coverage, privacy and bounded cleanup OK');
