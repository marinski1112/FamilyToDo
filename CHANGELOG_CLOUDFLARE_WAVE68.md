# Cloudflare Wave68

Version: **12.87.0-wave68**

## Calendar
- Fixed day-local task anchoring more aggressively.
- A normal single-day task on a date with no multi-day band is now absolutely anchored immediately below the date number, even if another date in the same week has multi-day bands.
- Existing multi-day stable bands, date pinning, swipe, day detail, and reorder behavior are preserved.

## Browser JavaScript externalization
Moved more interactive browser code out of TypeScript template literals into syntax-checkable assets:
- `public/assets/messages.js`
- `public/assets/message-new.js`
- `public/assets/settings.js`
- `public/assets/settings-members.js`

Dynamic CSRF/date values are passed through safe JSON payload elements.

`npm run check:browser-js` now checks calendar, recurring, messages, message-new, settings, and settings-members scripts.

## Lifecycle / orphan audit
Expanded notification lifecycle cleanup/audit:
- stale `shopping_items.task_id` is detached rather than deleting the shopping item
- stale `items.task_id` is detached rather than deleting the carry item
- audits orphan assignee/history rows
- audits duplicate `deleted_completion_history` groups
- audits archived completion rows whose member belongs to another family
- keeps existing recurrence/message/notification orphan checks

## Deleted completion archive hardening
Fixed deletion paths that could drop current shopping completion state without archiving it.
Shopping current completion state is archived as `shopping_legacy_completion` before operational rows are removed.

## Validation
Passed:
- `npx --no-install tsc --noEmit`
- `npm run check:browser-js`
- local SQLite migrations 0001–0015
- lifecycle audit SQL smoke test
- `PRAGMA foreign_key_check`

## Migration
No new D1 migration. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
