-- Wave87: optional label for generic timers. Existing typed timer rows remain valid.
ALTER TABLE family_log_timers ADD COLUMN timer_label TEXT NULL;
