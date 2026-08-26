# Family TODO LINE — Wave56

Version: `12.75.0-wave56`

## Fixed

- Calendar 500 after recurring-task creation.
  - `recurringForDate()` had a SQL statement with two `?` placeholders but only one `.bind()` value.
  - The occurrence id is now bound twice, matching the query exactly.
- Recurring-task delete/toggle reliability.
  - Replaced JS-only action buttons with real POST forms plus JS enhancement.
  - If JavaScript/fetch fails in LINE WebView, normal form POST still reaches the Worker.
  - JS path now reports HTTP/JSON errors instead of silently appearing unresponsive.

## UI

- Recurring-task form now conditionally shows only relevant fields:
  - `毎日`: hides interval/weekday/monthly-only controls.
  - `n日ごと`: shows interval only.
  - `毎週` / `n週ごと`: shows weekday; interval appears only for interval modes.
  - `毎月指定日`: shows month-day input.
  - `毎月第n曜日`: shows weekday + week-number selectors.
  - `毎月第n営業日`: shows business-day ordinal.
- Start/end time controls are hidden while `終日` is enabled.
- Calendar color is hidden while `カレンダーに表示` is disabled.
- Edit/reset operations recalculate field visibility immediately.

## Validation

- TypeScript `tsc --noEmit` passed.
- No D1 migration added in Wave56.
