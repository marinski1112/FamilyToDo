# Cloudflare D1 Wave52

## Legacy event FK cleanup

- Added `0015_wave52_remove_legacy_event_fk.sql`.
- Removes the obsolete `event_id` columns and `REFERENCES events(id)` constraints from `tasks`, `items`, `shopping_items`, `messages`, and `recurring_tasks`.
- Preserves all current task/calendar, item, shopping, message, recurrence, assignee, and completion-history data.
- Does not reintroduce the application event concept; LINE Webhook `events[]` remains unrelated and unchanged.
- Retains Wave50/Wave51 API SQL fixes.

## Root cause

Wave33 dropped `events` / `event_members`, but SQLite retained child-table foreign-key definitions created by the initial schema. D1 therefore rejected writes with `no such table: main.events`.
