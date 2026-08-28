# Cloudflare Wave111 — 12.130.0-wave111

## P0: ICS import CPU and recovery

- Replaced full-file-per-apply requests with browser-created, server-validated VCALENDAR mini-documents of at most 15 complete VEVENTs. VTIMEZONE metadata is retained and nested VALARM blocks are never split.
- Preview parses the file once. New events do not perform SHA-256; only identities already present in provenance are hashed for compatible Wave108–110 change detection.
- Added a prepare/session step that hashes the file once in the browser and resumes the latest matching `IMPORTING` batch by family, creator, and file hash. Apply treats the batch's `processed_count` as authoritative after lost responses.
- Each apply parses and hashes at most 15 events, finishes CPU work before writes, skips existing ACTIVE provenance on retry, and reconciles `created_count` from ACTIVE provenance rather than increments alone.
- History shows IMPORTING progress with resume/cancel actions. Non-JSON/503 failures produce a visible resumable interruption and do not auto-retry.

## Budgets and compatibility

- Apply request bodies are approximately metadata plus 15/634 of the source (about 5.5 KiB for a 224 KiB/634-event file); the full source is sent only for preview/optional normalization.
- Apply reports `parsed_event_count`, `sha_count`, and `query_count`; parsed/hash counts are <=15 and `MAX_D1_QUERY_BUDGET` remains 40.
- The raw ICS is not persisted and no migration is required. Google APIs are not called during import. Wave110 normalization and month calendar behavior remain unchanged.
