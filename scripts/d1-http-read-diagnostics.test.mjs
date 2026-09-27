import test from 'node:test';
import assert from 'node:assert/strict';
import {HTTP_READ_SAMPLE_RATE,httpReadRouteGroup,familyLogReadQueryGroup,trackHttpD1Reads} from '../src/d1-http-read-diagnostics.ts';

function fakeDb(){
  const writes=[];
  const db={
    prepare(sql){
      const stmt={
        bind(...args){return {...stmt,args};},
        async all(){return {results:[{id:1}],meta:{rows_read:250,rows_written:0}};},
        async run(){if(sql.includes('d1_http_read_diagnostics'))writes.push(this.args);return {meta:{rows_read:0,rows_written:1}};},
        async first(){return {id:1};},
      };
      return stmt;
    },
    async batch(statements){return statements.map(()=>({meta:{rows_read:12,rows_written:1}}));},
  };
  return {db,writes};
}

test('fixed labels exclude URL identifiers and query strings',()=>{
  assert.equal(HTTP_READ_SAMPLE_RATE,8);
  assert.equal(httpReadRouteGroup('/api/location/history/123?token=secret','GET'),'api_location_GET');
  assert.equal(httpReadRouteGroup('/app/messages.php','GET'),'page_messages_GET');
  assert.equal(httpReadRouteGroup('/api/calendar/abcdef','POST'),'api_calendar_WRITE');
});

test('counts all/run/batch and reports first as unmeasured; flush once',async()=>{
  const {db,writes}=fakeDb();
  const tracked=trackHttpD1Reads({DB:db},'api_location_GET');
  await tracked.env.DB.prepare('SELECT * FROM x').bind(1).all();
  await tracked.env.DB.prepare('SELECT * FROM x').first();
  assert.deepEqual(await tracked.env.DB.prepare('SELECT COUNT(*) c FROM x').first(),{id:1});
  await tracked.env.DB.prepare('UPDATE x').run();
  await tracked.env.DB.batch([tracked.env.DB.prepare('SELECT * FROM x')]);
  await tracked.flush();
  await tracked.flush();
  assert.equal(writes.length,1);
  assert.equal(writes[0][1],'api_location_GET');
  assert.deepEqual(writes[0].slice(2,6),[512,2,4,1]);
});

test('requests without D1 calls do not write diagnostics',async()=>{
  const {db,writes}=fakeDb();
  await trackHttpD1Reads({DB:db},'public_other_GET').flush();
  assert.equal(writes.length,0);
});

test('Family Log attribution uses only fixed labels and keeps page totals separate',async()=>{
  assert.equal(familyLogReadQueryGroup('SELECT subject_id,amount,ROW_NUMBER() OVER(PARTITION BY subject_id ORDER BY occurred_at DESC) FROM family_logs'),'latest_milk');
  assert.equal(familyLogReadQueryGroup("WITH selected_subjects(subject_id) AS (VALUES (?)) SELECT subject_id,(SELECT l.amount FROM family_logs l WHERE l.family_id=? AND l.subject_id=selected_subjects.subject_id AND l.log_type='MILK' ORDER BY l.occurred_at DESC LIMIT 1) amount FROM selected_subjects"),'latest_milk');
  assert.equal(familyLogReadQueryGroup('SELECT l.*,ib.source import_source FROM family_logs l'),'timeline');
  assert.equal(familyLogReadQueryGroup('WITH periods(period,start_at) AS (SELECT 1,2) SELECT * FROM family_logs'),'housework');
  assert.equal(familyLogReadQueryGroup("SELECT id FROM tasks WHERE family_id=? AND visibility_scope='FAMILY'"),'physical_tasks');
  const {db,writes}=fakeDb();
  const tracked=trackHttpD1Reads({DB:db},'page_family_log_GET');
  await tracked.env.DB.prepare('SELECT subject_id,ROW_NUMBER() OVER(PARTITION BY subject_id ORDER BY occurred_at DESC) FROM family_logs WHERE family_id=?').bind(42).all();
  await tracked.env.DB.prepare("WITH selected_subjects(subject_id) AS (VALUES (?)) SELECT (SELECT l.amount FROM family_logs l WHERE l.family_id=? AND l.log_type='MILK' LIMIT 1) FROM selected_subjects").bind(1,42).all();
  await tracked.env.DB.prepare('SELECT l.*,ib.source import_source FROM family_logs l WHERE l.family_id=?').bind(42).all();
  await tracked.env.DB.prepare('SELECT 1 FROM members LIMIT 1').first();
  await tracked.flush();
  assert.deepEqual(writes.map(args=>args[1]),['page_family_log_GET','query_family_log_latest_milk','query_family_log_timeline','query_family_log_other']);
  assert.equal(writes[0][2],1000);
  assert.equal(writes.slice(1).reduce((total,args)=>total+args[2],0),writes[0][2]);
  assert.equal(writes.every(args=>!args.includes(42)),true);
});
