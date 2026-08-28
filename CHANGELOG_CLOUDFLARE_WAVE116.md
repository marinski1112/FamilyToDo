# Wave116 — Google Tasks inbound hardening (12.135.0-wave116)

- Free-plan budget: one account and one page of at most 8 external tasks per invocation. The conservative worst case is 35 D1 statements (selection + lease + 8 × 4 + cursor commit), below `MAX_D1_QUERY_BUDGET=40`.
- A frozen overlap window, opaque page cursor, latest-seen timestamp, and cycle start are persisted. `updated_min` advances only when the final page completes. Invalid stored page tokens reset only the cursor and safely rescan through identity/etag deduplication.
- Expired `SYNCING` leases are selectable and leasable again; active leases remain busy.
- The five-minute cron runs notifications and Calendar only. The offset ten-minute cron runs Google Tasks only.
- NFKC-normalized `FT`, `Family TODO`, and `ファミリーTODO` markers route strict shopping commands through the Shopping domain helper. Unmarked tasks retain normal TASK import. Invalid marked commands produce `NEEDS_REVIEW`; no Gemini request is made.
- Migration 0039 appends continuation columns and an exactly-once external voice-command receipt table.
