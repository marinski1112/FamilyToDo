# Wave48 residual analysis

## Reported production failures

### GET /app/settings.php -> 500
The route reads migration-added schema, including `members.deleted_at`. If the remote D1 is behind Wave41+ migrations, the request throws a SQLite/D1 "no such column" error.

### POST /api/task -> 500
Task creation uses migration-added task columns (`start_at`, `end_at`, `location`, `calendar_visible`, `calendar_color`, `task_kind`, `reminder_at`) and related tables. A stale remote schema can therefore fail at the INSERT or subsequent child/notification write.

The supplied Workers logs omit the underlying exception text, so the exact missing object cannot be identified from the two JSON records alone. Wave48 adds schema diagnostics and actionable error classification.

## Required remote verification
1. `npx wrangler d1 migrations list familytodo --remote`
2. `npx wrangler d1 migrations apply familytodo --remote` (or the equivalent binding command)
3. `GET /__cf/db-schema-health`
4. Retry `/app/settings.php` and task creation.

Do not run the migration blindly against a different database. Verify the database ID/binding first.

## Remaining application audit
- Completion -> uncompletion -> re-completion state matrix
- Notification regeneration after uncompletion/assignee changes
- Recurring task stop/restart notification lifecycle
- Remote D1 integration tests
- Device-level smartphone QA
