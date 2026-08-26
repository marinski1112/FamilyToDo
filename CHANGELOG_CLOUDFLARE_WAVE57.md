# Family TODO LINE Cloudflare Wave57

Version: `12.76.0-wave57`

## Fixed

- Recurring-task result messages now distinguish save / delete / active-state change. HTML-form fallback no longer reports a delete as "saved".
- Recurring-task conditional fields now use explicit `display:none/block` toggling instead of relying on the `hidden` property. This is intended to behave reliably in LINE iOS WebView.
- Recurrence-specific fields are only shown for the recurrence type that actually uses them:
  - DAILY: no interval / weekday / monthly fields
  - INTERVAL_DAYS: interval only
  - WEEKLY: weekdays only
  - INTERVAL_WEEKS: interval + weekdays
  - MONTHLY_DAY: month days only
  - MONTHLY_WEEKDAY: weekday + nth-week selections
  - MONTHLY_BUSINESS_DAY: business-day ordinal only
- Recurring start/end time inputs remain hidden while "all day" is selected.
- Recurring calendar color remains hidden when calendar display is disabled.
- Task-add timed scheduling UI now keeps start/end dates separate from start/end times and uses a mobile-safe stacked layout.
- Fixed timed multi-day task normalization: a time-only `endTime` now uses `endDateOnly`, not the start date.
- Task edit and message-to-task forms now follow the same all-day/time and calendar-visible/color conditional UI rules.
- CSS cache version bumped to Wave57.

## Validation

- `npx --no-install tsc --noEmit` passes.
- No D1 migration is added in Wave57. Latest migration remains `0015_wave52_remove_legacy_event_fk.sql`.
