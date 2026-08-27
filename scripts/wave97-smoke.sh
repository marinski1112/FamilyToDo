#!/usr/bin/env bash
set -euo pipefail
node --input-type=module <<'JS'
import fs from 'node:fs';
const ai=fs.readFileSync('src/family-ai.ts','utf8'),cal=fs.readFileSync('src/google-calendar.ts','utf8'),idx=fs.readFileSync('src/index.ts','utf8');
const has=(s,x)=>{if(!s.includes(x))throw new Error('missing '+x)};
for(const x of ['daily_family_log_aggregate','quick_chore_stats','task_stats','schedule_lookup','family_log_latest','functionDeclarations','GEMINI_API_KEY',"datetime(occurred_at,'+9 hours')",'deleted_at IS NULL','SQL is forbidden'])has(ai,x);
for(const x of ['AES-GCM','GOOGLE_CALENDAR_TOKEN_KEY','Family TODO','calendar_sync_outbox',"visibility_scope||'FAMILY'",'calendar_visible','retry_count'])has(cal,x);
has(fs.readFileSync('migrations/0033_wave97_family_ai_calendar.sql','utf8'),'sync_token');
for(const x of ['/api/family-ai/query','/oauth/google-calendar/authorize','/oauth/google-calendar/callback','processCalendarOutbox'])has(idx,x);
JS
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for f in migrations/*.sql; do sqlite3 "$db" < "$f"; done
for t in external_calendar_accounts external_calendar_links calendar_sync_outbox calendar_sync_state; do test "$(sqlite3 "$db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='$t'")" = 1; done
# Provider mapping cannot cross-family via task projection logic; PRIVATE and no-date are SQL-verifiably ineligible.
sqlite3 "$db" "INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(970,'W97','Wave97','now','now'); INSERT INTO members(id,family_id,line_user_id,name,active,created_at,updated_at) VALUES(970,970,'w97','B',1,'now','now'); INSERT INTO tasks(id,family_id,title,status,completion_mode,created_by,created_at,updated_at,calendar_visible,task_kind,visibility_scope) VALUES(970,970,'private','pending','ANY',970,'now','now',1,'TASK','PRIVATE'),(971,970,'no date','pending','ANY',970,'now','now',1,'TASK','FAMILY');"
test "$(sqlite3 "$db" "SELECT count(*) FROM tasks WHERE family_id=970 AND visibility_scope='FAMILY' AND calendar_visible=1 AND (start_at IS NOT NULL OR due_at IS NOT NULL)")" = 0
# Outbox coalescing retains CREATE, but privacy-driven DELETE wins.
sqlite3 "$db" "INSERT INTO external_calendar_accounts(family_id,member_id,provider,refresh_token_ciphertext,token_key_version,calendar_id,created_at,updated_at) VALUES(970,970,'GOOGLE_CALENDAR','v1.iv.cipher','v1','cal','now','now'); INSERT INTO calendar_sync_outbox(family_id,task_id,provider,operation,next_retry_at,created_at,updated_at) VALUES(970,971,'GOOGLE_CALENDAR','CREATE','now','now','now') ON CONFLICT(provider,task_id) DO UPDATE SET operation=CASE WHEN excluded.operation='DELETE' THEN 'DELETE' WHEN calendar_sync_outbox.operation='CREATE' THEN 'CREATE' ELSE 'UPDATE' END; INSERT INTO calendar_sync_outbox(family_id,task_id,provider,operation,next_retry_at,created_at,updated_at) VALUES(970,971,'GOOGLE_CALENDAR','DELETE','now','now','now') ON CONFLICT(provider,task_id) DO UPDATE SET operation=CASE WHEN excluded.operation='DELETE' THEN 'DELETE' WHEN calendar_sync_outbox.operation='CREATE' THEN 'CREATE' ELSE 'UPDATE' END;"
test "$(sqlite3 "$db" "SELECT operation FROM calendar_sync_outbox WHERE task_id=971")" = DELETE
echo 'wave97 family ai/calendar smoke: ok'
