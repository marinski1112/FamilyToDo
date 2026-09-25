-- 0105: preserve the original empty-category clock when a completed Shopping row is removed.
-- Pending-row deletion still starts the empty-category grace period. Normalize
-- the remaining completed rows with the same JST wall-clock rule as checklist-completion.ts.
DROP TRIGGER IF EXISTS shopping_category_last_content_delete;
DROP TRIGGER IF EXISTS shopping_category_last_content_move;

CREATE TRIGGER shopping_category_last_content_delete AFTER DELETE ON shopping_items
WHEN OLD.status<>'completed' AND EXISTS (SELECT 1 FROM families WHERE id=OLD.family_id)
 AND trim(COALESCE(OLD.category,''))<>'' AND (1)
 AND NOT EXISTS (
   SELECT 1 FROM shopping_items g WHERE g.family_id=OLD.family_id
     AND g.category=OLD.category COLLATE NOCASE
     AND date(g.due_date) IS date(OLD.due_date)
     AND (g.due_date IS NOT NULL OR g.status<>'completed' OR (CASE WHEN substr(g.completed_at,-1)='Z' OR substr(g.completed_at,-6,1) IN ('+','-') THEN datetime(g.completed_at,'+9 hours') ELSE datetime(g.completed_at) END) >=
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
     AND (g.due_date IS NOT NULL OR g.status<>'completed' OR (CASE WHEN substr(g.completed_at,-1)='Z' OR substr(g.completed_at,-6,1) IN ('+','-') THEN datetime(g.completed_at,'+9 hours') ELSE datetime(g.completed_at) END) >=
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
