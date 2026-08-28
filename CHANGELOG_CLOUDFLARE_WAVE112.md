# Cloudflare Wave112 — safe exact-ordinal ICS resume

## Production recovery priority

Wave111's history **再開** control only changed explanatory text and called `file.focus()`; it made no API request and did not open a reliable picker in LINE iOS WebView. Therefore the two reported clicks did not mutate D1. Wave112 labels the action **同じICSを選んで再開**, invokes `file.click()` inside the gesture, verifies the selected file hash/event count against the exact batch through the status API, and waits for explicit **再開する** confirmation.

The browser now retains calendar metadata plus individual VEVENT blocks and constructs every <=15-event mini-calendar from the server-authoritative `processed_count`. An old Wave110 batch at ordinal 17 therefore sends source events 17–31, rather than the old fixed chunk 15–29. Lost responses resync to the server ordinal; offsets 0, 1, 14, 15, 16, 17, 29, 30, 31 and 633 complete 634 identities with no missing or duplicate ordinal.

## Concurrency and migration

Migration `0037_wave112_calendar_import_resume_lock.sql` marks duplicate active batches FAILED (highest `processed_count`, then newest id wins; tasks/provenance are not deleted), adds a partial unique active-file index, a 25-second apply lease, and normalization mode. Prepare uses exact `resume_batch_id` ownership/hash/status checks and `INSERT OR IGNORE`. Apply parses/validates and hashes at most 15 events before atomically claiming the offset lease. A competing writer receives HTTP 409 `IMPORT_BUSY`; stale offsets resync. Progress advancement is a second processed-count/token CAS and clears the lease. Rollback refuses an unexpired lease. TTL allows recovery after a hard Worker interruption.

ACTIVE provenance remains the identity backstop, not the concurrency lock. Task and provenance creation are still separate D1 statements, so a hard interruption between them can leave an orphan task. Wave112 materially narrows that residual window with one writer, pre-write CPU work, <=15-event chunks, provenance skip, and offset CAS; it does not claim full event transaction atomicity or introduce unverified row-id behavior.

Normalization-enabled new batches are marked token-required. They cannot resume after the signed normalization confirmation expires, preventing a half-normalized import; safely roll them back and re-import with one consistent setting. The production recovery file described for Wave112 uses normalization OFF.

## Safe production resume

1. Deploy migration 0037 and Wave112.
2. Open Admin → Calendar import history and locate the intended IMPORTING row.
3. Tap **同じICSを選んで再開**, select the exact already-normalized ICS (leave in-app normalization OFF).
4. Confirm the shown `processed / 634` and remaining count; a wrong file is rejected without creating a batch.
5. Tap **再開する** once and keep the WebView open. Progress advances from the exact server ordinal.
6. If `IMPORT_BUSY` appears, do not retry apply immediately; wait over 25 seconds and refresh status. After a lost response, repeat the same workflow and the server ordinal resumes safely.

CPU/D1 envelopes remain apply parse <=15, SHA <=15, no full raw ICS in apply, and <=40 D1 statements. ICS import does not call Google APIs; existing Google Calendar/Home behavior is unchanged.
