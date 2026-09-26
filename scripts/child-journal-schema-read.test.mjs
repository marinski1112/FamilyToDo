import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {childJournalSchemaStatus,childJournalCalendarReady} from '../src/child-journal-schema.ts';

const names=['family_log_journal_entries','child_journal_calendar_accounts','child_journal_calendar_links','child_journal_calendar_outbox'];
function database(){
  const sqlite=new DatabaseSync(':memory:');
  const queries=[];
  const db={prepare(sql){
    queries.push(sql);
    return {async all(){return {results:sqlite.prepare(sql).all()};}};
  }};
  return {sqlite,db,queries};
}

test('missing and empty tables preserve fail-closed migration readiness',async()=>{
  const {sqlite,db,queries}=database();
  assert.deepEqual(await childJournalSchemaStatus(db),{foundation:false,calendar:false});
  sqlite.exec(`CREATE TABLE ${names[0]}(id INTEGER)`);
  assert.deepEqual(await childJournalSchemaStatus(db),{foundation:true,calendar:false});
  for(const name of names.slice(1))sqlite.exec(`CREATE TABLE ${name}(id INTEGER)`);
  assert.equal(await childJournalCalendarReady(db),true);
  assert.equal(queries.every(sql=>/^SELECT 1 FROM "[a-z_]+" LIMIT 1$/.test(sql)),true);
  sqlite.close();
});

test('unexpected D1 errors propagate instead of appearing as missing migrations',async()=>{
  const db={prepare(){return {async all(){throw new Error('D1 unavailable');}};}};
  await assert.rejects(childJournalSchemaStatus(db),/D1 unavailable/);
});
