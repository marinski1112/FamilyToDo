# Family TODO LINE Cloudflare Wave54

Version: `12.73.0-wave54`

## Main changes

- Family invitation now auto-discovers the connected LINE Official Account through Messaging API `GET /v2/bot/info` using the existing `LINE_ACCESS_TOKEN`.
- Invite API returns the Official Account Basic/Premium ID and automatically generated friend-add/recommend URLs.
- Family-member and settings invite UI now shows the invite URL and friend-add URL together, with Web Share API / clipboard fallback.
- Join page shows a direct "LINE公式アカウントを友だち追加" button when bot info is available.
- Fixed malformed inline JavaScript on the family join page.
- Recurring-task form hardened for mobile: explicit DOM lookup instead of form named-property assumptions, saving state, network/error handling, recurrence-type validation, and functioning shopping/item expand/add buttons.
- Added activity-log records for recurring-task create/update.
- Message -> task conversion now supports:
  - attach to an existing pending normal task from a dropdown;
  - optionally append message text to the task description;
  - create a new task with date/end date/no-date, all-day/time, location, assignees, completion mode, reminder, calendar visibility, and color;
  - default assignment to the message target when no assignee is explicitly selected.
- CSS cache-busting advanced to Wave54.

## Database

No new D1 migration in Wave54.
Wave52 migration `0015_wave52_remove_legacy_event_fk.sql` remains the latest migration.

## Verification

- `npx --no-install tsc --noEmit`: PASS
- Fresh SQLite application of migrations `0001` through `0015`: PASS
- Recurring task + recurrence rule insert against migrated schema: PASS
- Message-derived normal task insert against migrated schema: PASS
- `PRAGMA foreign_key_check`: 0 rows in local verification database
