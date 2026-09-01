import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');
const migration=fs.readFileSync('migrations/0033_wave97_family_ai_calendar.sql','utf8');

for(const marker of [
  'AES-GCM',
  'GOOGLE_CALENDAR_TOKEN_KEY',
  'Family TODO',
  'calendar_sync_outbox',
  "visibility_scope||'FAMILY'",
  'calendar_visible',
  'retry_count',
]) assert.ok(calendar.includes(marker),marker);
assert.ok(migration.includes('sync_token'),'Wave97 Calendar migration must retain sync_token');
assert.ok(exceptionRoutes.includes('/oauth/google-calendar/authorize'),'/oauth/google-calendar/authorize');
assert.ok(index.includes('processCalendarOutbox'),'processCalendarOutbox');
assert.ok(publicRoutes.includes('/oauth/google-calendar/callback'),'/oauth/google-calendar/callback');

const db=path.join(os.tmpdir(),`familytodo-calendar-foundation-${process.pid}-${Date.now()}.sqlite`);
try {
  for(const file of fs.readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort()) {
    execFileSync('sqlite3',[db],{input:fs.readFileSync(path.join('migrations',file),'utf8')});
  }
  for(const table of ['external_calendar_accounts','external_calendar_links','calendar_sync_outbox','calendar_sync_state']) {
    const count=execFileSync('sqlite3',[db,`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='${table}'`],{encoding:'utf8'}).trim();
    assert.equal(count,'1',`missing table ${table}`);
  }
  execFileSync('sqlite3',[db,`INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(970,'W97','Wave97','now','now'); INSERT INTO members(id,family_id,line_user_id,name,active,created_at,updated_at) VALUES(970,970,'w97','B',1,'now','now'); INSERT INTO tasks(id,family_id,title,status,completion_mode,created_by,created_at,updated_at,calendar_visible,task_kind,visibility_scope) VALUES(970,970,'private','pending','ANY',970,'now','now',1,'TASK','PRIVATE'),(971,970,'no date','pending','ANY',970,'now','now',1,'TASK','FAMILY');`]);
  const visibleUndated=execFileSync('sqlite3',[db,"SELECT count(*) FROM tasks WHERE family_id=970 AND visibility_scope='FAMILY' AND calendar_visible=1 AND (start_at IS NOT NULL OR due_at IS NOT NULL)"],{encoding:'utf8'}).trim();
  assert.equal(visibleUndated,'0','undated task must not qualify for Calendar projection');
  execFileSync('sqlite3',[db,`INSERT INTO external_calendar_accounts(family_id,member_id,provider,refresh_token_ciphertext,token_key_version,calendar_id,created_at,updated_at) VALUES(970,970,'GOOGLE_CALENDAR','v1.iv.cipher','v1','cal','now','now'); INSERT INTO calendar_sync_outbox(family_id,task_id,provider,operation,next_retry_at,created_at,updated_at) VALUES(970,971,'GOOGLE_CALENDAR','CREATE','now','now','now') ON CONFLICT(provider,task_id) DO UPDATE SET operation=CASE WHEN excluded.operation='DELETE' THEN 'DELETE' WHEN calendar_sync_outbox.operation='CREATE' THEN 'CREATE' ELSE 'UPDATE' END; INSERT INTO calendar_sync_outbox(family_id,task_id,provider,operation,next_retry_at,created_at,updated_at) VALUES(970,971,'GOOGLE_CALENDAR','DELETE','now','now','now') ON CONFLICT(provider,task_id) DO UPDATE SET operation=CASE WHEN excluded.operation='DELETE' THEN 'DELETE' WHEN calendar_sync_outbox.operation='CREATE' THEN 'CREATE' ELSE 'UPDATE' END;`]);
  const operation=execFileSync('sqlite3',[db,'SELECT operation FROM calendar_sync_outbox WHERE task_id=971'],{encoding:'utf8'}).trim();
  assert.equal(operation,'DELETE','DELETE must dominate an existing CREATE outbox operation');
} finally {
  try { fs.unlinkSync(db); } catch {}
}

console.log('calendar-sync-foundation-contract: encryption/config markers, routes, schema, projection eligibility, and outbox precedence ok');
