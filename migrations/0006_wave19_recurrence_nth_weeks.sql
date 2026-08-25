ALTER TABLE recurrence_rules ADD COLUMN week_numbers_json TEXT;
UPDATE recurrence_rules SET week_numbers_json = CASE WHEN week_number IS NOT NULL THEN '[' || week_number || ']' ELSE '[1]' END WHERE week_numbers_json IS NULL;
