-- Completion time follows the existing JST wall-clock contract; explicit offsets are normalized.
CREATE INDEX idx_shopping_items_completed_cleanup ON shopping_items((CASE WHEN substr(COALESCE(completed_at,updated_at,created_at),-1)='Z' OR substr(COALESCE(completed_at,updated_at,created_at),-6,1) IN ('+','-') THEN datetime(COALESCE(completed_at,updated_at,created_at),'+9 hours') ELSE datetime(COALESCE(completed_at,updated_at,created_at)) END),id) WHERE status='completed';
-- Legacy completion tables have no foreign keys. Remove only this row's entries.
CREATE TRIGGER shopping_items_cleanup_completions AFTER DELETE ON shopping_items
BEGIN
  DELETE FROM shopping_completions WHERE shopping_item_id=OLD.id;
END;
CREATE INDEX idx_items_completed_cleanup ON items((CASE WHEN substr(COALESCE(completed_at,updated_at,created_at),-1)='Z' OR substr(COALESCE(completed_at,updated_at,created_at),-6,1) IN ('+','-') THEN datetime(COALESCE(completed_at,updated_at,created_at),'+9 hours') ELSE datetime(COALESCE(completed_at,updated_at,created_at)) END),id) WHERE status='completed';
-- Legacy completion tables have no foreign keys. Remove only this row's entries.
CREATE TRIGGER items_cleanup_completions AFTER DELETE ON items
BEGIN
  DELETE FROM item_completions WHERE item_id=OLD.id;
END;
