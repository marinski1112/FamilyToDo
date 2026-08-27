-- Wave83: server-enforced visibility for ordinary one-off tasks.
ALTER TABLE tasks ADD COLUMN visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'
  CHECK (visibility_scope IN ('FAMILY','PRIVATE'));
ALTER TABLE tasks ADD COLUMN private_owner_id INTEGER NULL REFERENCES members(id) ON DELETE SET NULL;

UPDATE tasks SET visibility_scope='FAMILY', private_owner_id=NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_family_visibility_owner
  ON tasks(family_id, visibility_scope, private_owner_id);
