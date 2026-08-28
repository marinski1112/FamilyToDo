# Family TODO LINE Wave128 — 12.147.0-wave128

## Calendar and privacy
- Recurrence occurrences now carry rule, occurrence, and date identifiers and open the owned recurring editor; synthetic negative IDs never enter task detail URLs.
- Added server-side `all`, `family`, `assigned`, and `private` calendar scopes and preserved the scope during month/day navigation.
- PRIVATE EVENT is supported, remains owner-only without assignees, and is never projected to Google Calendar.

## Google Calendar
- Normal backfill includes historical FAMILY EVENTs while old completed TASKs remain excluded.
- Added an OWNER/ADMIN preview-first full EVENT history enqueue action and distinct target/linked/outbox/watch diagnostics.
- Google cancellation archives/deletes local EVENT lifecycle data without outbound echo; TASK cancellation only removes its projection. Local deletion retains outbox/link information until Google DELETE finishes.

## Notifications and mobile UI
- Ordinary notification delivery is Web Push only, with no LINE fallback.
- Added opt-in, family-timezone LINE morning digests, selected recipients, recipient-specific PRIVATE filtering, bounded same-day retry, and unique daily receipts.
- Family Log quick labels use four columns and up to two unclipped lines; the timer heading is now `⏱ タイマー`.

## Migration and operations
- Append-only migration `0042_wave128_calendar_digest_private_event.sql` adds only digest settings, recipients, and delivery receipts. No task/event schema change and no legacy event tables.
- Deploy and remote D1 migration are separate operator actions; GitHub CI success does not imply either production action completed.
