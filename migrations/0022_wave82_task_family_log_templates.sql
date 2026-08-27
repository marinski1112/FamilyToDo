-- Wave82: reusable task-backed Family Log templates and one-tap provenance.
CREATE TABLE task_family_log_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  subject_id INTEGER NULL,
  log_type TEXT NOT NULL,
  detail_code TEXT NULL,
  amount REAL NULL,
  unit TEXT NULL,
  duration_minutes INTEGER NULL,
  value_text TEXT NULL,
  note TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by INTEGER NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES family_log_subjects(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_task_family_log_templates_active_task
ON task_family_log_templates(task_id) WHERE active=1;
CREATE INDEX idx_task_family_log_templates_family
ON task_family_log_templates(family_id, task_id, active);

ALTER TABLE family_logs ADD COLUMN task_family_log_template_id INTEGER NULL
  REFERENCES task_family_log_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_family_logs_template
ON family_logs(task_family_log_template_id);

-- D1/SQLite partial indexes permit a replacement after the old log is soft deleted.
CREATE UNIQUE INDEX idx_family_logs_template_occurrence_recorder_active
ON family_logs(task_family_log_template_id, linked_occurrence_id, created_by)
WHERE deleted_at IS NULL
  AND task_family_log_template_id IS NOT NULL
  AND linked_occurrence_id IS NOT NULL
  AND created_by IS NOT NULL;
