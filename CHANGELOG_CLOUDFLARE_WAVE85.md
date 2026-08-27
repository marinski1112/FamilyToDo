# Cloudflare Wave85 — 12.104.0-wave85

## Changes
- Activity log reads now inherit the current PRIVATE visibility of task, item parent, and shopping parent without an OWNER/ADMIN override.
- Added mobile GET filters, 50-row pagination, and scheduled 31-day JST activity-log retention. Completion histories and Family Log are not deleted.
- PRIVATE child create/edit screens lock the task context and show owner-only assignment guidance.
- Notification settings list only the current member's sanitized device diagnostics, allow per-registration removal, and report test totals.
- Diagnostics cover Web Push health and inactive PRIVATE owners without exposing endpoint or key material.

## Database
No migration. Existing columns and indexes are sufficient. Legacy `events` / `event_members` remain removed.

## Verification
Wave85 SQLite smoke covers current-parent log privacy, standalone children, retention isolation, and Push diagnostic fixtures. Merge requires all GitHub Actions checks to be green.
