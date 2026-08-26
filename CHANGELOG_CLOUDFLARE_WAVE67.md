# Cloudflare Wave67

Version: **12.86.0-wave67**

## Calendar
- Multi-day band space is now reserved **per date**, not for every date in a week.
- If a date has no multi-day band, ordinary single-day tasks start immediately under the date number even when another date in the same week has a multi-day task.
- Calendar month display still hides recurring templates/occurrences with `calendar_visible=0`.
- Day-detail payload now includes recurring occurrences regardless of `calendar_visible`, so a recurring task can be hidden from the month grid but still appear when the date is opened.
- Hidden recurring occurrences are labelled `定期・月非表示` in day detail.
- Existing date tap, day/month swipe, reorder, stable multi-day lanes and overflow remain intact.

## Recurring lifecycle management
- Added an `除外した発生日` section to recurring-task management.
- An occurrence previously deleted with “この日だけ除外したまま” can now be restored with `復活する`.
- Restore is accepted only if the occurrence still belongs to the current recurrence rule/date range.
- Added split-series lineage labels using `SPLIT_FUTURE` activity logs:
  - `← 分割元`
  - `次シリーズ →`
- No schema migration was required.

## Browser JavaScript hardening
- Moved the recurring-task management controller out of the TypeScript HTML template into:
  - `public/assets/recurring.js`
- Dynamic values are passed via `#recurringConfig` JSON.
- Added:
  - `npm run check:recurring-js`
  - `npm run check:browser-js`
- This follows the calendar controller approach introduced after the Wave62 regression and lets Node parse-check the actual browser JavaScript.

## Lifecycle / notification cleanup
- Scheduled lifecycle cleanup now clears stale `messages.converted_to_task_id` / `converted_to_shopping_id` pointers when the converted target was deleted.
- If duplicate pending/retry notifications somehow exist despite the partial unique index, the oldest is kept and later duplicates are cancelled before delivery.
- Runtime audit now also counts:
  - orphan recurrence exception links
  - orphan recurrence rules
  - stale message conversion links
- Ambiguous recurrence exception orphans are audited, not silently repaired.

## Validation
Passed:
```bash
npx --no-install tsc --noEmit
node --check public/assets/calendar.js
node --check public/assets/recurring.js
npm run check:browser-js
```

Local SQLite migrations `0001`–`0015` applied successfully. New lifecycle cleanup SQL prepares/executes against the migrated schema and `PRAGMA foreign_key_check` is clean.

## Migration
No new D1 migration. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
