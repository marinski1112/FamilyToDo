#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs'),app=fs.readFileSync('src/app.ts','utf8'),cal=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8'),idx=fs.readFileSync('src/index.ts','utf8');
const has=(s,x)=>{if(!s.includes(x))throw Error('missing '+x)};
has(app,'Promise.allSettled');has(app,'⚠️ この診断を実行できませんでした');has(app,'/api/settings/diagnostics-detail?issue=');has(app,'初期ロード ${DIAGNOSTIC_DEFINITIONS.length} query');
const diagnostic=app.slice(app.indexOf('const DIAGNOSTIC_DEFINITIONS'),app.indexOf('export async function inviteCreate'));
if(/\bUNION(?:\s+ALL)?\b/i.test(diagnostic))throw Error('compound SELECT remains in settings diagnostics');
has(cal,'calendar.app.created');has(cal,"q.set('syncToken',syncToken)");has(cal,'nextSyncToken');has(cal,"visibility_scope='FAMILY'");has(cal,"calendar_visible=0");has(cal,"status='REVOKED'");has(cal,'processCalendarInbound');has(cal,'plusDay');has(idx,"'/api/google-calendar/sync'");has(idx,'processCalendarInbound(env)');
if((cal.match(/refresh_token_ciphertext/g)||[]).length<2)throw Error('encrypted refresh token flow missing');
console.log('wave99 static smoke ok');
JS
# Large-data regression: compound-term count is independent of fixture size because diagnostics contain no compound SELECT.
db=$(mktemp); trap 'rm -f "$db"' EXIT
sqlite3 "$db" <<'SQL'
CREATE TABLE family_logs(id INTEGER PRIMARY KEY,family_id INTEGER,occurred_at TEXT);
CREATE TABLE notifications(id INTEGER PRIMARY KEY,family_id INTEGER);
CREATE TABLE completion_history(id INTEGER PRIMARY KEY,family_id INTEGER);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2500) INSERT INTO family_logs SELECT x,1,'2026-01-01 00:00:00' FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO notifications SELECT x,1 FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO completion_history SELECT x,1 FROM n;
SQL
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_logs')" = 2500
echo 'wave99 large fixture smoke ok'
