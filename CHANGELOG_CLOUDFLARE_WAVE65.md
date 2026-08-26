# Wave65 / 12.84.0-wave65

## Calendar dense-week layout fix
- Fixed severe date-number displacement introduced by dense-week/multi-day layout.
- Root cause: Wave61 wrapped day cells inside `.calendar-week-days`, so older direct-child top-left rules such as `.calendar-grid > .calendar-cell` no longer applied. Wave64 added dynamic height but still allowed the shared button layout to position `.num` relative to content.
- Date numbers are now absolutely pinned to the top-left of every day cell, independent from bands, task rows, shopping counts, and item rows.
- The week is explicitly layered as:
  1. date-number zone
  2. multi-day bands
  3. single-day tasks / shopping / items
- Existing dynamic week height, 4 visible single-day tasks, +N overflow, 4 multi-day lanes, date tap, swipe, reorder, and stable bands are preserved.

## Message -> shopping conversion
- Removed the remaining product-name browser `prompt()` flow.
- Added a proper mobile bottom sheet for converting a message into shopping.
- Supports product name, quantity, category, due date, optional task link, assignees, memo, and URL.
- Message recipient is used as the default shopping assignee when present.
- API now validates task ownership, member IDs, due date format, and http/https URLs.

## Validation
- `npx --no-install tsc --noEmit`: PASS
- `node --check public/assets/calendar.js`: PASS
- `npm run check:calendar-js`: PASS
- No D1 migration added. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
