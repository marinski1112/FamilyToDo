# Cloudflare Wave19

- Calendar day detail is modal-only and no longer leaves a stale static detail card.
- Calendar month view hides holiday names while keeping holiday names in day detail.
- Calendar date numbers are top-left aligned.
- Calendar multi-day tasks/events now carry start/middle/end segment classes and continuation markers.
- Calendar day detail supports previous/next day buttons, horizontal swipe, and keyboard arrows; Escape closes the modal.
- Recurring monthly weekday rules now support multiple ordinal weeks (1st-5th) via `week_numbers_json`.
- Existing `week_number` remains as backward-compatible fallback.
- Added migration `0006_wave19_recurrence_nth_weeks.sql`.
- Form date/datetime width and shared mobile layout changes from prior waves are retained.
