# Family TODO LINE Cloudflare Wave59

- Calendar parity work based on the former XREA/PHP calendar behavior.
- Month previous/next buttons and horizontal calendar swipe now replace the month grid in-place instead of forcing a full page reload; network/error fallback still navigates normally.
- Day detail supports previous/next buttons, horizontal swipe and keyboard arrows with a short transition, including automatic month loading when navigation crosses the loaded grid boundary.
- Calendar day detail keeps task/item/shopping checkboxes and task-detail links; completed tasks are visually de-emphasized and recurrence occurrence IDs are passed directly to the toggle API.
- Calendar task creation now honors `return=calendar`: after save, the calendar reopens the selected date instead of sending the user to Today.
- Added an initial `?date=YYYY-MM-DD` calendar deep-link behavior that opens that day's detail automatically.
- Calendar payload embedded for client-side month replacement is HTML-safe escaped.
- CSS cache-busting updated to `12.78-wave59`.
- No D1 migration. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
- `tsc --noEmit` passes.
