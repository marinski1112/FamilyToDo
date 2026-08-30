#!/usr/bin/env bash
set -euo pipefail

db="$(mktemp)"
trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done

sqlite3 "$db" <<'SQL'
PRAGMA foreign_keys=OFF;
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(85,'W85','Wave85','2026-08-27','2026-08-27'),(86,'W86','Other','2026-08-27','2026-08-27');
INSERT INTO members(id,family_id,line_user_id,name,role,active,deleted_at,created_at,updated_at) VALUES
(851,85,'a','A','OWNER',1,NULL,'2026-08-27','2026-08-27'),(852,85,'b','B','ADMIN',1,NULL,'2026-08-27','2026-08-27'),(853,85,'off','Off','MEMBER',0,NULL,'2026-08-27','2026-08-27'),(861,86,'x','X','MEMBER',1,NULL,'2026-08-27','2026-08-27');
INSERT INTO tasks(id,family_id,title,status,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES(851,85,'became private','pending',851,'2026-08-27','2026-08-27','PRIVATE',851);
INSERT INTO items(id,family_id,name,status,created_by,created_at,updated_at,task_id) VALUES(851,85,'secret item','pending',851,'2026-08-27','2026-08-27',851),(852,85,'standalone','pending',851,'2026-08-27','2026-08-27',NULL);
INSERT INTO shopping_items(id,family_id,name,status,created_by,created_at,updated_at,task_id) VALUES(851,85,'secret shop','pending',851,'2026-08-27','2026-08-27',851),(852,85,'standalone','pending',851,'2026-08-27','2026-08-27',NULL);
INSERT INTO activity_logs(id,family_id,member_id,action,target_type,target_id,occurred_at) VALUES(851,85,851,'CREATED','task',851,'2026-08-27'),(852,85,851,'CREATED','item',851,'2026-08-27'),(853,85,851,'CREATED','shopping',851,'2026-08-27'),(854,85,851,'CREATED','item',852,'2026-08-27'),(855,85,851,'CREATED','shopping',852,'2026-08-27'),(856,85,851,'OLD','message',1,'2026-06-01');
INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(851,851,'COMPLETED','2026-06-01');
INSERT INTO web_push_subscriptions(id,family_id,member_id,endpoint,p256dh,auth,enabled,failure_count,created_at,updated_at) VALUES(851,85,851,'https://push/1','k','a',1,0,'2026','2026'),(852,85,853,'https://push/2','k','a',1,2,'2026','2026'),(853,85,861,'https://push/3','k','a',1,0,'2026','2026');
SQL

vis(){ local mid="$1"; sqlite3 "$db" "SELECT group_concat(id) FROM (SELECT id FROM activity_logs a WHERE a.family_id=85 AND (a.target_type NOT IN ('task','item','shopping') OR (a.target_type='task' AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=a.target_id AND t.family_id=a.family_id AND NOT (t.visibility_scope='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=$mid)))) OR (a.target_type='item' AND NOT EXISTS(SELECT 1 FROM items i JOIN tasks t ON t.id=i.task_id AND t.family_id=i.family_id WHERE i.id=a.target_id AND i.family_id=a.family_id AND NOT (t.visibility_scope='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=$mid)))) OR (a.target_type='shopping' AND NOT EXISTS(SELECT 1 FROM shopping_items s JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE s.id=a.target_id AND s.family_id=a.family_id AND NOT (t.visibility_scope='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=$mid))))) ORDER BY id);"; }
test "$(vis 852)" = '854,855,856'
test "$(vis 851)" = '851,852,853,854,855,856'

sqlite3 "$db" "DELETE FROM activity_logs WHERE occurred_at < datetime('2026-08-27','-31 days');"
test "$(sqlite3 "$db" 'SELECT count(*) FROM activity_logs')" = 5
test "$(sqlite3 "$db" 'SELECT count(*) FROM task_completion_history')" = 1
test "$(sqlite3 "$db" "SELECT count(*) FROM web_push_subscriptions s LEFT JOIN members m ON m.id=s.member_id WHERE s.family_id=85 AND s.failure_count>0")" = 1
test "$(sqlite3 "$db" "SELECT count(*) FROM web_push_subscriptions s LEFT JOIN members m ON m.id=s.member_id WHERE s.family_id=85 AND s.enabled=1 AND m.active=0")" = 1
test "$(sqlite3 "$db" "SELECT count(*) FROM web_push_subscriptions s LEFT JOIN members m ON m.id=s.member_id WHERE s.family_id=85 AND (m.id IS NULL OR m.family_id<>s.family_id)")" = 1

diagnostic="$(sqlite3 "$db" "SELECT id,member_id,'failure' FROM web_push_subscriptions WHERE failure_count>0")"
DIAGNOSTIC="$diagnostic" node -e "const value=process.env.DIAGNOSTIC||'';if(/endpoint|p256dh|auth/i.test(value)){console.error('push secret leaked');process.exit(1)}"

echo 'activity-log-push-diagnostics-contract: visibility, retention, history, and push diagnostics ok'
