import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const home=fs.readFileSync('src/google-home.ts','utf8');
const app=fs.readFileSync('src/app.ts','utf8');
const docs=fs.readFileSync('docs/GOOGLE_HOME_VOICE_SETUP.md','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');

for(const marker of [
  'action.devices.SYNC','action.devices.EXECUTE','action.devices.DISCONNECT','action.devices.QUERY',
  'action.devices.types.SCENE','action.devices.traits.Scene','action.devices.commands.ActivateScene',
  'authorization_code','refresh_token','SHA-256','GOOGLE_HOME_CLIENT_ID','GOOGLE_HOME_CLIENT_SECRET',
  'GOOGLE_HOME_REDIRECT_URI','external_command_receipts',"subject_kind IN ('BABY','CHILD')",'family_id=? AND active=1',
]) assert.ok(home.includes(marker),marker);
for(const marker of ['recordQuickChoreDomain','startDedicatedSleepDomain','stopDedicatedSleepDomain','supportsDedicatedSleep']) assert.ok(app.includes(marker),marker);
assert.ok(exceptionRoutes.includes('/oauth/google/authorize'),'/oauth/google/authorize');
for(const marker of ['/oauth/google/token','/api/google-home/fulfillment','/__cf/google-home-health']) assert.ok(publicRoutes.includes(marker),marker);
for(const marker of ['assistant.event.OkGoogle','device.command.ActivateScene','home.execution.Webhook','動的読み上げ']) assert.ok(docs.includes(marker),marker);

const db=path.join(os.tmpdir(),`familytodo-google-home-foundation-${process.pid}-${Date.now()}.sqlite`);
try {
  for(const file of fs.readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort()) {
    execFileSync('sqlite3',[db],{input:fs.readFileSync(path.join('migrations',file),'utf8')});
  }
  for(const table of ['google_home_authorization_codes','google_home_tokens','external_command_receipts']) {
    const count=execFileSync('sqlite3',[db,`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table}'`],{encoding:'utf8'}).trim();
    assert.equal(count,'1',`missing table ${table}`);
  }
  execFileSync('sqlite3',[db,`INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(96,'W96','Wave96','2026-08-27','2026-08-27'),(97,'W97','Other','2026-08-27','2026-08-27'); INSERT INTO members(id,family_id,line_user_id,name,active,created_at,updated_at) VALUES(96,96,'line96','linked',1,'2026-08-27','2026-08-27'),(97,97,'line97','other',1,'2026-08-27','2026-08-27'); INSERT INTO external_command_receipts(provider,family_id,member_id,request_id,command_key,status,created_at,updated_at) VALUES('GOOGLE_HOME',96,96,'req','ft:chore:1:activate','SUCCESS','now','now'); INSERT OR IGNORE INTO external_command_receipts(provider,family_id,member_id,request_id,command_key,status,created_at,updated_at) VALUES('GOOGLE_HOME',96,96,'req','ft:chore:1:activate','SUCCESS','now','now');`]);
  const receipts=execFileSync('sqlite3',[db,"SELECT COUNT(*) FROM external_command_receipts WHERE request_id='req'"],{encoding:'utf8'}).trim();
  assert.equal(receipts,'1','Google Home request retry must remain idempotent');
  execFileSync('sqlite3',[db,`INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_by,created_at,updated_at) VALUES(961,96,'baby','BABY',1,96,'now','now'),(962,96,'child','CHILD',1,96,'now','now'),(963,96,'pet','PET',1,96,'now','now'),(971,97,'other child','CHILD',1,97,'now','now'); INSERT INTO family_quick_chores(id,family_id,name,active,sort_order,created_by,created_at,updated_at) VALUES(961,96,'active',1,1,96,'now','now'),(962,96,'inactive',0,2,96,'now','now'),(971,97,'other chore',1,1,97,'now','now');`]);
  assert.equal(execFileSync('sqlite3',[db,"SELECT COUNT(*) FROM family_log_subjects WHERE family_id=96 AND active=1 AND subject_kind IN ('BABY','CHILD')"],{encoding:'utf8'}).trim(),'2');
  assert.equal(execFileSync('sqlite3',[db,"SELECT COUNT(*) FROM family_quick_chores WHERE family_id=96 AND active=1"],{encoding:'utf8'}).trim(),'1');
  execFileSync('sqlite3',[db,`INSERT INTO google_home_tokens(family_id,member_id,access_token_hash,refresh_token_hash,access_expires_at,created_at,updated_at) VALUES(96,96,'access-hash','refresh-hash',9999999999,'now','now'); INSERT INTO family_logs(family_id,log_type,occurred_at,created_by,created_at,updated_at) VALUES(96,'HOUSEWORK','now',96,'now','now'); UPDATE google_home_tokens SET revoked_at='now' WHERE access_token_hash='access-hash';`]);
  assert.equal(execFileSync('sqlite3',[db,"SELECT COUNT(*) FROM google_home_tokens WHERE access_token_hash='access-hash' AND revoked_at IS NOT NULL"],{encoding:'utf8'}).trim(),'1');
  assert.equal(execFileSync('sqlite3',[db,"SELECT COUNT(*) FROM family_logs WHERE family_id=96"],{encoding:'utf8'}).trim(),'1','token revocation must not delete Family Log data');
} finally {
  try { fs.unlinkSync(db); } catch {}
}

console.log('google-home-foundation-contract: protocol/OAuth markers, family-scoped Scene data, request idempotency, and token-revocation isolation ok');
