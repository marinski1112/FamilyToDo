# Cloudflare Wave109 — 12.128.0-wave109

## Calendar import production hardening

- Replaced the `(UID, RECURRENCE-ID)` OR lookup (161 binds for 80 events) with one family-scoped provenance read and exact JavaScript `UID\0RECURRENCE-ID` matching. Preview query count is constant for up to 5,000 events.
- Apply uses the same lookup, ten-event chunks, and at most four EXDATE rows per recurring event. The documented worst-case chunk budget is 67 D1 statements.
- Rollback processes 15 provenance rows at a time and returns `processed`, `cursor`, and `done`. Conditional ACTIVE transitions make retries idempotent.
- `ROLLED_BACK` and `MISSING` provenance rows are reactivated for a new task/batch instead of inserted, preserving the unique source identity. `EDITED_KEPT` remains protected.
- All routes inside the global request catch are awaited. Calendar import unknown failures return safe JSON with `CALENDAR_IMPORT_INTERNAL_ERROR` and a request ID.

## Optional TimeTree title-time normalization

- Normalization is explicitly OFF by default. A local deterministic parser handles clear leading single times and ranges; a single time never implies a duration.
- Missing-end policy defaults to keeping the event all-day; 30/60/90 minutes require explicit selection.
- Timed DTSTART and RRULE events are excluded. Empty cleaned titles and invalid/cross-midnight times are rejected.
- Only ambiguous title/date/opaque-ID candidates are sent, in batches of 30, to the explicitly selected existing Family AI provider. There is no provider fallback and apply/rollback make zero AI calls.
- Suggestions are schema-validated and carried in a family/member/file-bound, expiring HMAC token. Apply only accepts confirmed IDs from that signed state; source UID and source hash remain based on the original ICS.

## Database

No migration. Wave108 migration `0036_wave108_calendar_ics_import.sql` remains unchanged.

## Production retest

1. Deploy and upload the 634-event TimeTree ICS.
2. Confirm preview returns HTTP 200 JSON and classification totals without a D1 variable error.
3. Import without normalization first; verify progress completes in 64 or fewer ten-event requests.
4. Roll back; verify the UI iterates to `done`, edited events remain, and retrying rollback is harmless.
5. Re-import the same file and verify rolled-back identities reactivate without UNIQUE failures.
6. Preview normalization with AI OFF, then optionally enable AI and confirm only ambiguous candidates incur batched requests.
