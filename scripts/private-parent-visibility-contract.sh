#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"
trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
sqlite3 "$db" <<'SQL'
PRAGMA foreign_keys=OFF;
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(84,'W84','Wave84','2026-08-27','2026-08-27');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES
 (841,84,'w84-owner','owner','OWNER',1,'2026-08-27','2026-08-27'),
 (842,84,'w84-admin','admin','ADMIN',1,'2026-08-27','2026-08-27');
INSERT INTO tasks(id,family_id,title,status,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES
 (841,84,'private','pending',841,'2026-08-27','2026-08-27','PRIVATE',841),
 (842,84,'family','pending',842,'2026-08-27','2026-08-27','FAMILY',NULL);
INSERT INTO shopping_items(id,family_id,name,category,status,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES
 (841,84,'private shop','SECRET','pending',841,'2026-08-27','2026-08-27','PRIVATE',841),
 (842,84,'family shop','SHARED','pending',842,'2026-08-27','2026-08-27','FAMILY',NULL),
 (843,84,'standalone shop','STANDALONE','pending',842,'2026-08-27','2026-08-27','FAMILY',NULL);
INSERT INTO items(id,family_id,name,status,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES
 (841,84,'private item','pending',841,'2026-08-27','2026-08-27','PRIVATE',841),
 (842,84,'family item','pending',842,'2026-08-27','2026-08-27','FAMILY',NULL),
 (843,84,'standalone item','pending',842,'2026-08-27','2026-08-27','FAMILY',NULL);
INSERT INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(84,841,'task_reminder','task',841,'2026-09-01','pending','private', '2026-08-27');
SQL
visibility="(COALESCE(visibility_scope,'FAMILY')='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id="
assert_eq(){ actual="$1" expected="$2" label="$3"; test "$actual" = "$expected" || { echo "$label: expected $expected, got $actual" >&2; exit 1; }; }
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM tasks WHERE family_id=84 AND ${visibility}841));" )" 2 'owner task visibility'
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM tasks WHERE family_id=84 AND ${visibility}842));" )" 1 'admin has no private override'
goods="(x.visibility_scope='FAMILY' OR (x.visibility_scope='PRIVATE' AND x.private_owner_id=842))"
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM shopping_items x WHERE x.family_id=84 AND $goods;")" 2 'shopping privacy'
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM items x WHERE x.family_id=84 AND $goods;")" 2 'item privacy'
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM shopping_items x WHERE x.family_id=84 AND x.status='pending' AND $goods;")" 2 'home count visibility'
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM shopping_items x WHERE x.family_id=84 AND $goods AND category='SECRET';")" 0 'category privacy'
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM shopping_items x WHERE x.family_id=84 AND x.private_owner_id=841;")" 1 'private shopping ownership'
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM items x WHERE x.family_id=84 AND x.private_owner_id=841;")" 1 'private item ownership'
assert_eq "$(sqlite3 "$db" "SELECT count(*) FROM notifications WHERE target_type='task' AND target_id=841 AND member_id<>841 AND status IN ('pending','retry');")" 0 'private notifications'
# Goods editing uses Goods-owned privacy and must never revive the old Task column.
node --input-type=module <<'JS'
import fs from 'node:fs';
for(const path of ['src/item-edit-page.ts','src/shopping-edit-page.ts']){
  const source=fs.readFileSync(path,'utf8');
  if(source.includes('task_id=NULL')||!source.includes('goodsVisibilitySql('))throw new Error(path+' must preserve Goods-owned privacy without a Task column');
}
JS
echo 'private-parent-visibility-contract: independent Goods ownership, task visibility, and notification isolation ok'
