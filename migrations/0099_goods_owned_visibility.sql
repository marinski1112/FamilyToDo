-- Snapshot goods privacy before retiring parent-task relations.
-- Do not clear task_id here: every reader/writer must be converted first.
-- This migration must ship with the completed reader/writer conversion.
ALTER TABLE shopping_items ADD COLUMN visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'
  CHECK (visibility_scope IN ('FAMILY','PRIVATE'));
ALTER TABLE shopping_items ADD COLUMN private_owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'
  CHECK (visibility_scope IN ('FAMILY','PRIVATE'));
ALTER TABLE items ADD COLUMN private_owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL;

-- Missing/cross-family parents were invisible before migration: keep them private,
-- ownerless and invisible. Never guess ownership from the creator or assignees.
UPDATE shopping_items SET
  visibility_scope=CASE WHEN task_id IS NULL OR EXISTS(
    SELECT 1 FROM tasks t WHERE t.id=shopping_items.task_id AND t.family_id=shopping_items.family_id
      AND t.visibility_scope='FAMILY'
  ) THEN 'FAMILY' ELSE 'PRIVATE' END,
  private_owner_id=(SELECT m.id FROM tasks t JOIN members m
    ON m.id=t.private_owner_id AND m.family_id=t.family_id
    WHERE t.id=shopping_items.task_id AND t.family_id=shopping_items.family_id AND t.visibility_scope='PRIVATE');
UPDATE items SET
  visibility_scope=CASE WHEN task_id IS NULL OR EXISTS(
    SELECT 1 FROM tasks t WHERE t.id=items.task_id AND t.family_id=items.family_id
      AND t.visibility_scope='FAMILY'
  ) THEN 'FAMILY' ELSE 'PRIVATE' END,
  private_owner_id=(SELECT m.id FROM tasks t JOIN members m
    ON m.id=t.private_owner_id AND m.family_id=t.family_id
    WHERE t.id=items.task_id AND t.family_id=items.family_id AND t.visibility_scope='PRIVATE');

CREATE INDEX idx_shopping_family_visibility_owner ON shopping_items(family_id,visibility_scope,private_owner_id);
CREATE INDEX idx_items_family_visibility_owner ON items(family_id,visibility_scope,private_owner_id);
