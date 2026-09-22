-- Goods catalogs remain independent. UTC lifecycle timestamps are explicit.
-- Historical zone-less created_at is interpreted as UTC, matching the previous
-- browser contract. Never backfill with now (old empty categories stay archived).

ALTER TABLE shopping_category_catalog ADD COLUMN activated_at TEXT;
UPDATE shopping_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at);
CREATE TRIGGER shopping_category_activate_insert AFTER INSERT ON shopping_category_catalog
WHEN NEW.activated_at IS NULL
BEGIN
  UPDATE shopping_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
END;
CREATE TRIGGER shopping_category_reactivate AFTER UPDATE OF enabled ON shopping_category_catalog
WHEN OLD.enabled=0 AND NEW.enabled=1
BEGIN
  UPDATE shopping_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
END;

CREATE INDEX idx_shopping_category_lifecycle ON shopping_items(family_id,category COLLATE NOCASE,date(due_date));

CREATE TRIGGER shopping_category_last_content_delete AFTER DELETE ON shopping_items
WHEN EXISTS (SELECT 1 FROM families WHERE id=OLD.family_id)
 AND trim(COALESCE(OLD.category,''))<>'' AND (1)
 AND NOT EXISTS (
   SELECT 1 FROM shopping_items g WHERE g.family_id=OLD.family_id
     AND g.category=OLD.category COLLATE NOCASE
     AND date(g.due_date) IS date(OLD.due_date)
     AND (g.due_date IS NOT NULL OR g.status<>'completed' OR g.completed_at >=
       CASE WHEN strftime('%H','now','+9 hours')='00'
         THEN datetime('now','+9 hours','start of day','-1 hour')
         ELSE datetime('now','+9 hours','start of day') END)
     AND (g.visibility_scope='FAMILY' OR (OLD.visibility_scope='PRIVATE' AND g.visibility_scope='PRIVATE' AND g.private_owner_id=OLD.private_owner_id))
 )
BEGIN
  INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,activated_at)
    VALUES(OLD.family_id,trim(OLD.category),1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  UPDATE shopping_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE family_id=OLD.family_id AND name=OLD.category COLLATE NOCASE AND enabled=1;
END;

CREATE TRIGGER shopping_category_last_content_move AFTER UPDATE OF category,due_date,family_id,visibility_scope,private_owner_id ON shopping_items
WHEN EXISTS (SELECT 1 FROM families WHERE id=OLD.family_id)
 AND trim(COALESCE(OLD.category,''))<>'' AND (OLD.family_id IS NOT NEW.family_id OR OLD.category IS NOT NEW.category COLLATE NOCASE OR date(OLD.due_date) IS NOT date(NEW.due_date) OR OLD.visibility_scope IS NOT NEW.visibility_scope OR OLD.private_owner_id IS NOT NEW.private_owner_id)
 AND NOT EXISTS (
   SELECT 1 FROM shopping_items g WHERE g.family_id=OLD.family_id
     AND g.category=OLD.category COLLATE NOCASE
     AND date(g.due_date) IS date(OLD.due_date)
     AND (g.due_date IS NOT NULL OR g.status<>'completed' OR g.completed_at >=
       CASE WHEN strftime('%H','now','+9 hours')='00'
         THEN datetime('now','+9 hours','start of day','-1 hour')
         ELSE datetime('now','+9 hours','start of day') END)
     AND (g.visibility_scope='FAMILY' OR (OLD.visibility_scope='PRIVATE' AND g.visibility_scope='PRIVATE' AND g.private_owner_id=OLD.private_owner_id))
 )
BEGIN
  INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,activated_at)
    VALUES(OLD.family_id,trim(OLD.category),1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  UPDATE shopping_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE family_id=OLD.family_id AND name=OLD.category COLLATE NOCASE AND enabled=1;
END;

ALTER TABLE item_category_catalog ADD COLUMN activated_at TEXT;
UPDATE item_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at);
CREATE TRIGGER item_category_activate_insert AFTER INSERT ON item_category_catalog
WHEN NEW.activated_at IS NULL
BEGIN
  UPDATE item_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
END;
CREATE TRIGGER item_category_reactivate AFTER UPDATE OF enabled ON item_category_catalog
WHEN OLD.enabled=0 AND NEW.enabled=1
BEGIN
  UPDATE item_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
END;

CREATE INDEX idx_item_category_lifecycle ON items(family_id,category COLLATE NOCASE,date(due_at));

CREATE TRIGGER item_category_last_content_delete AFTER DELETE ON items
WHEN EXISTS (SELECT 1 FROM families WHERE id=OLD.family_id)
 AND trim(COALESCE(OLD.category,''))<>'' AND (1)
 AND NOT EXISTS (
   SELECT 1 FROM items g WHERE g.family_id=OLD.family_id
     AND g.category=OLD.category COLLATE NOCASE
     AND date(g.due_at) IS date(OLD.due_at)
     AND (g.visibility_scope='FAMILY' OR (OLD.visibility_scope='PRIVATE' AND g.visibility_scope='PRIVATE' AND g.private_owner_id=OLD.private_owner_id))
 )
BEGIN
  INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,activated_at)
    VALUES(OLD.family_id,trim(OLD.category),1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  UPDATE item_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE family_id=OLD.family_id AND name=OLD.category COLLATE NOCASE AND enabled=1;
END;

CREATE TRIGGER item_category_last_content_move AFTER UPDATE OF category,due_at,family_id,visibility_scope,private_owner_id ON items
WHEN EXISTS (SELECT 1 FROM families WHERE id=OLD.family_id)
 AND trim(COALESCE(OLD.category,''))<>'' AND (OLD.family_id IS NOT NEW.family_id OR OLD.category IS NOT NEW.category COLLATE NOCASE OR date(OLD.due_at) IS NOT date(NEW.due_at) OR OLD.visibility_scope IS NOT NEW.visibility_scope OR OLD.private_owner_id IS NOT NEW.private_owner_id)
 AND NOT EXISTS (
   SELECT 1 FROM items g WHERE g.family_id=OLD.family_id
     AND g.category=OLD.category COLLATE NOCASE
     AND date(g.due_at) IS date(OLD.due_at)
     AND (g.visibility_scope='FAMILY' OR (OLD.visibility_scope='PRIVATE' AND g.visibility_scope='PRIVATE' AND g.private_owner_id=OLD.private_owner_id))
 )
BEGIN
  INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,activated_at)
    VALUES(OLD.family_id,trim(OLD.category),1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  UPDATE item_category_catalog SET activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE family_id=OLD.family_id AND name=OLD.category COLLATE NOCASE AND enabled=1;
END;
