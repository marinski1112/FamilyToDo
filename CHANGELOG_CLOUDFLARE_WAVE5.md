# Family TODO LINE Cloudflare migration — Wave 5

## Recurring task management completion

- Added recurring-task edit flow.
- Added recurring-task deletion flow (rule, generated occurrence records, and owned template task).
- Added recurrence fields that were previously present in the D1 compatibility schema but not writable from the UI:
  - monthly week number
  - monthly business-day ordinal
  - weekdays JSON
  - monthdays JSON
- Added recurring task template fields for description, location, start/end time, all-day, calendar visibility, and completion mode.
- Added validation for recurrence type, dates, interval, and time ordering.
- POST responses commit the session so CSRF state remains durable when it is first created.

## Scope / safety

- No existing XREA/PHP source is modified.
- No new database migration is required; this wave uses columns already created by the existing v12.35 compatibility migration.
- Cloudflare Runtime Secrets are unchanged.
- LINE webhook cutover and DNS cutover remain intentionally disabled.
