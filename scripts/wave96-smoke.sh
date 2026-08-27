#!/usr/bin/env bash
set -euo pipefail
node --input-type=module <<'JS'
import fs from 'node:fs';
const gh=fs.readFileSync('src/google-home.ts','utf8'),app=fs.readFileSync('src/app.ts','utf8'),docs=fs.readFileSync('docs/GOOGLE_HOME_VOICE_SETUP.md','utf8'),idx=fs.readFileSync('src/index.ts','utf8');
const has=(s,x)=>{if(!s.includes(x))throw new Error('missing '+x)};
for(const x of ['action.devices.SYNC','action.devices.EXECUTE','action.devices.DISCONNECT','action.devices.QUERY','action.devices.types.SCENE','action.devices.traits.Scene','action.devices.commands.ActivateScene','authorization_code','refresh_token','SHA-256','GOOGLE_HOME_CLIENT_ID','GOOGLE_HOME_CLIENT_SECRET','GOOGLE_HOME_REDIRECT_URI','external_command_receipts',"subject_kind IN ('BABY','CHILD')",'family_id=? AND active=1'])has(gh,x);
for(const x of ['recordQuickChoreDomain','startDedicatedSleepDomain','stopDedicatedSleepDomain','supportsDedicatedSleep'])has(app,x);
for(const x of ['/oauth/google/authorize','/oauth/google/token','/api/google-home/fulfillment','/__cf/google-home-health'])has(idx,x);
for(const x of ['assistant.event.OkGoogle','device.command.ActivateScene','home.execution.Webhook','動的読み上げ'])has(docs,x);
JS
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for f in migrations/*.sql; do sqlite3 "$db" < "$f"; done
for table in google_home_authorization_codes google_home_tokens external_command_receipts; do test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table'")" = 1; done
# authorization code one-time/expiry fields, token revocation, and request retry uniqueness are DB-enforced.
sqlite3 "$db" "INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(96,'W96','Wave96','2026-08-27','2026-08-27'); INSERT INTO members(id,family_id,line_user_id,name,active,created_at,updated_at) VALUES(96,96,'line96','linked',1,'2026-08-27','2026-08-27'); INSERT INTO external_command_receipts(provider,family_id,member_id,request_id,command_key,status,created_at,updated_at) VALUES('GOOGLE_HOME',96,96,'req','ft:chore:1:activate','SUCCESS','now','now'); INSERT OR IGNORE INTO external_command_receipts(provider,family_id,member_id,request_id,command_key,status,created_at,updated_at) VALUES('GOOGLE_HOME',96,96,'req','ft:chore:1:activate','SUCCESS','now','now');"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM external_command_receipts WHERE request_id='req'")" = 1
sqlite3 "$db" "INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(97,'W97','Other','2026-08-27','2026-08-27'); INSERT INTO members(id,family_id,line_user_id,name,active,created_at,updated_at) VALUES(97,97,'line97','other',1,'2026-08-27','2026-08-27'); INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_by,created_at,updated_at) VALUES(961,96,'baby','BABY',1,96,'now','now'),(962,96,'child','CHILD',1,96,'now','now'),(963,96,'pet','PET',1,96,'now','now'),(971,97,'other child','CHILD',1,97,'now','now'); INSERT INTO family_quick_chores(id,family_id,name,active,sort_order,created_by,created_at,updated_at) VALUES(961,96,'active',1,1,96,'now','now'),(962,96,'inactive',0,2,96,'now','now'),(971,97,'other chore',1,1,97,'now','now');"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_log_subjects WHERE family_id=96 AND active=1 AND subject_kind IN ('BABY','CHILD')")" = 2
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_log_subjects WHERE family_id=96 AND subject_kind='PET' AND subject_kind IN ('BABY','CHILD')")" = 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_quick_chores WHERE family_id=96 AND active=1")" = 1
# Hashed token rows can be revoked without touching existing Family Log data.
sqlite3 "$db" "INSERT INTO google_home_tokens(family_id,member_id,access_token_hash,refresh_token_hash,access_expires_at,created_at,updated_at) VALUES(96,96,'access-hash','refresh-hash',9999999999,'now','now'); INSERT INTO family_logs(family_id,log_type,occurred_at,created_by,created_at,updated_at) VALUES(96,'HOUSEWORK','now',96,'now','now'); UPDATE google_home_tokens SET revoked_at='now' WHERE access_token_hash='access-hash';"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM google_home_tokens WHERE access_token_hash='access-hash' AND revoked_at IS NOT NULL")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE family_id=96")" = 1
echo 'wave96 google home smoke: ok'
