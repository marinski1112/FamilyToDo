# Cloudflare Wave66

Version: **12.85.0-wave66**

## Calendar
- Ordinary single-day tasks are explicitly sorted ahead of recurring virtual occurrences.
- When a week has no multi-day bands, ordinary tasks start immediately below the date zone.
- Existing date pinning, stable multi-day bands, day detail, swipe, and reorder behavior are preserved.

## Today / Tomorrow / task detail UI
- Removed duplicated shopping-add wording/control.
- Daily task rows now have one actual “add shopping” action; the empty details summary is simply “買い物”.
- Task detail keeps the add control in the child-shopping section and removes the duplicate standalone add button.

## Recurring exception deletion lifecycle
Exception tasks created by “この日だけ通常タスクにする” now require an explicit delete choice:
1. **元の定期日に戻す**
2. **この日だけ除外したまま削除**

`recurringForDate()` now respects `excluded` occurrence state.

## Recurring “future only” edits
Recurring edit UI now includes:
- この定期タスク全体
- 指定日以降だけ変更

For future-only changes, the old rule ends the day before the effective date and a new template/rule starts on the effective date. Assignees and linked shopping/items are carried forward. Future materialized non-exception occurrence cache rows are regenerated and archived completion history is preserved where removed.

Existing recurring shopping/items are now loaded into the edit form so an ordinary edit no longer silently removes them.

## Notification lifecycle audit
Cron cleanup now also:
- cancels member/family inconsistent pending work
- cancels pending/retry reminders for stopped/deleted recurring templates
- audits duplicate active reminder groups
- audits orphan pending task/message notifications

## Validation
- `npx --no-install tsc --noEmit` passed.
- `node --check public/assets/calendar.js` passed.
- `npm run check:calendar-js` passed.
- Local SQLite migrations 0001–0015 applied successfully.
- Future-series split and excluded-occurrence lifecycle SQL were smoke-tested.
- Notification lifecycle cleanup SQL was smoke-tested.

## Migration
No new D1 migration. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
