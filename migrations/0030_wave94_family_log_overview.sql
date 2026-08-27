-- Wave94: explicitly promoted all-view shortcuts remain separate from subject-page types.
ALTER TABLE family_log_subjects ADD COLUMN show_on_family_overview INTEGER NOT NULL DEFAULT 0 CHECK(show_on_family_overview IN (0,1));
ALTER TABLE family_log_subjects ADD COLUMN overview_quick_types_json TEXT NULL;

