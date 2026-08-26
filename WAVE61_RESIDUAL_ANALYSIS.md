# Wave61 residual analysis

## Implemented in this wave
1. Calendar day-sheet swipe now works across the sheet surface, not only the text area.
2. Day and month changes have live touch feedback and smoother slide/fade transitions.
3. Multi-day tasks now use stable week-spanning bands, based on the former XREA/PHP lane algorithm.

## Remaining XREA / Cloudflare functional gaps

### P0 / P1 Calendar
- Touch-safe task reorder in day detail. XREA had drag reorder and `/app/api/reorder.php`; Worker route already exists but iPhone-safe UI is still needed.
- Decide how to expose more than three simultaneous multi-day lanes without making month cells too tall (expand detail, per-day overflow, or compact lane mode).
- After task/item/shopping edits, refresh only the open day sheet instead of relying on a full navigation.
- Audit recurring exception dates inside multi-day/normal-task transitions.

### Recurring lifecycle
- Verify one occurrence -> normal task conversion end-to-end.
- Verify shopping/items linked to the recurring template are copied or re-bound correctly on exception conversion.
- Define future-only vs entire-series editing behavior.
- Verify delete/toggle/edit cancels stale notifications and leaves no orphan occurrences/completions.

### Messages
- Replace remaining browser `prompt()` editing with a proper sheet/modal.
- Make message -> shopping conversion use the same richer fields as normal shopping creation where appropriate.
- Define converted-message lifecycle if the target task/shopping row is later deleted.

### Family / invitations
- Active invitation list.
- Revoke invitation.
- Explicit expired/used state in UI.
- Continue automatic LINE Official Account friend-add URL with a configured fallback URL when API discovery fails.

### Notifications
- Full orphan/stale audit after task/message/recurrence edit/delete.
- Verify rescheduling never leaves duplicate pending/retry notifications.

## UI / design cleanup
- Standardize modal/bottom-sheet spacing, close controls, FAB safe-area, and touch targets.
- Keep list screens compact; move secondary metadata to detail sheets.
- Use one conditional form pattern for task, recurring, message conversion, shopping and items.
- Remove alert/prompt as the main editing UI where practical.

## Technical debt / garbage candidates

### `calendar.css`
The file still contains both the old XREA calendar selectors (`.cal`, `#calBody`, `.week`, `.week-bars`) and the Worker selectors (`.calendar-grid`, `.calendar-cell`) plus many Wave-era overrides. Wave61 intentionally does not delete the old blocks while stable bands are being validated. Once the new band layout is confirmed in production, consolidate to one calendar CSS system and remove obsolete overrides.

### Root documentation history
Large numbers of `CHANGELOG_CLOUDFLARE_WAVE*.md`, `MIGRATION_PROGRESS_WAVE*.md`, and `WAVE*_RESIDUAL_ANALYSIS.md` remain in the repo root. Keep during migration/audit, then move to `docs/history/` or consolidate after stabilization. Do not delete migration SQL.

### Compatibility routes
PHP-looking aliases are still valuable for old LIFF links/bookmarks. Do not remove until access logs demonstrate they are unused.

### Completion/history/archive tables
Do not remove merely for tidiness. First document the canonical write/read path and verify retention/archive behavior.

## Engineering audits still required
- parser-aware SQL placeholder vs `.bind()` audit
- rendered inline-script syntax audit
- button/route coverage audit
- orphan-data audit after delete/conversion
- login redirect-loop/error fallback audit
