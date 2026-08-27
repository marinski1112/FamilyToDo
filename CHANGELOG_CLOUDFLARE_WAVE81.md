# Cloudflare Wave81

## `quick_chore_id` integrity

- Added `family_logs.quick_chore_id` to schema and runtime health checks and to the full migration smoke test.
- Extended read-only lifecycle diagnostics to report missing quick chores, cross-family quick-chore references, and quick-chore links on non-HOUSEWORK records. Inactive quick chores remain valid.
- Kept a quick-chore source link when editing HOUSEWORK as HOUSEWORK, clear it when changing to another type, and never infer it from `value_text` for manual or previously unlinked records.

## Lightweight chore history

- Added a compact, member-visible Family Log card for the past seven days and current month.
- Shows family totals, stable quick-chore-item totals, and recorder (`created_by`) totals.
- Includes inactive chores in history, labels them as hidden, keeps name snapshots in individual timeline rows, separates legacy unlinked HOUSEWORK records, and excludes soft-deleted logs.

## Database and compatibility

- No migration was added and migration 0021 was not changed.
- Events remain task-backed through `tasks.task_kind=EVENT`; legacy `events` / `event_members` were not restored.
- No dependency was added. Calendar, task, recurrence, shopping, and message behavior remains unchanged.

## Device validation remaining

- The compact disclosure card, safe-area behavior, and tap/edit flows still require validation in a real LINE iOS WebView after deployment.
