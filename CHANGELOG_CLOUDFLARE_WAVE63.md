# Family TODO LINE Cloudflare Wave63

- Fixes the Wave62 calendar interaction regression where date detail and month/day swipe stopped responding without a Worker error.
- Root cause: Wave62 reorder code inserted an invalid destructuring assignment into the browser-side calendar JavaScript (`[rows[a],rows[b]]` used as a declaration target). TypeScript compilation could not detect it because the code lived inside a rendered HTML string.
- Moves the complete calendar browser controller out of the TypeScript HTML template into `public/assets/calendar.js`.
- Calendar dynamic values (month bounds, today, CSRF, detail maps) now arrive through the existing `calendarPayload` JSON element.
- `calendar.js` is directly syntax-checked with Node; package script `check:calendar-js` added.
- Reorder rollback now swaps rows with ordinary temporary-variable assignments, avoiding parse-sensitive syntax.
- Existing Wave61 behavior is retained: date detail, day swipe, month swipe, smooth drag preview and multi-day stable bands.
- No D1 migration added. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
- CSS/asset cache version: `12.82-wave63`.
