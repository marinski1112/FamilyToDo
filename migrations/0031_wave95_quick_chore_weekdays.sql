-- Wave95: daily visibility is independent from the quick chore lifecycle.
ALTER TABLE family_quick_chores ADD COLUMN weekday_mask INTEGER NOT NULL DEFAULT 127 CHECK(weekday_mask BETWEEN 0 AND 127);
