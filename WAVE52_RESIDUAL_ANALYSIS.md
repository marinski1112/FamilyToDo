# Wave52 residual analysis

## Fixed

1. Remote D1 had `events` removed but stale `event_id -> events(id)` foreign keys remained in five live tables.
2. Task, item, shopping, and message writes could therefore fail before normal application logic with `D1_ERROR: no such table: main.events`.
3. Wave52 rebuilds only the affected tables and their direct FK children, preserving existing IDs and data.

## Verification targets after migration

- `PRAGMA foreign_key_check;` returns no rows.
- `sqlite_master` contains no `REFERENCES events` in live tables.
- `PRAGMA table_info(...)` for the five affected tables contains no `event_id`.
- Task, item, shopping, message creation succeeds.
- Existing assignee/history rows remain present.
- Calendar remains task-only.
