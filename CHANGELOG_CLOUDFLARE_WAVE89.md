# Cloudflare Wave89 — 12.108.0-wave89

## Large Family Log import

- Preview computes all source keys in memory, detects same-file duplicates with a `Set`, and looks up D1 keys in bounded 90-key `IN` queries rather than one query per record.
- Confirm is now a resumable `start` → 100-record `chunk` → `finish` protocol. Each chunk uses one D1 `batch`, unique source keys make retry idempotent, and counts are reconciled from batch-owned rows.
- Import batches expose `PREVIEWED`, `IMPORTING`, `COMPLETED`, `FAILED`, and `ROLLED_BACK` state with processed/failure/completion timestamps. Complete and partial batches retain edit-safe whole-batch rollback.
- The UI shows progress, retry, type counts, date range, and only the first 50 preview rows. Uploaded values are rendered only through `textContent`, removing preview DOM XSS.
- Requests and files are capped at 3 MiB and 5,000 records. Conversion metadata remains ignored and is never persisted.

## Family Log

- Added 💉 `VACCINE` (予防接種), with vaccine name in `value_text`, to BABY/CHILD defaults and normalized imports. Existing MEMO records are unchanged.
- Imported MILK/TEMPERATURE/HEIGHT/WEIGHT units and SLEEP duration use the normal Family Log columns and timeline/chart behavior.

## Future diary design

Untimed 育児日記 entries must not receive fabricated times. Follow-up candidates are an `occurred_date` / all-day Family Log record or a separate diary domain; Wave89 intentionally does not normalize untimed diary entries.
