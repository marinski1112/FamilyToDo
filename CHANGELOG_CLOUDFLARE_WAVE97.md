# Cloudflare Wave97 — 12.116.0-wave97

## Family AI Query
- Gemini Function Calling is restricted to five typed, read-only tools. Member and subject names are tokenized before the question is sent.
- Gemini receives the tokenized question and current JST time only. D1 rows, task titles, log values and aggregate results are never returned to Gemini.
- Every query is family-scoped, soft-deleted logs are excluded, and Family Log day grouping uses JST. Arbitrary SQL and unknown tools are rejected.

## Google Calendar
- Separate OAuth credentials/scopes and endpoints create a dedicated secondary `Family TODO` calendar.
- Refresh tokens use versioned AES-GCM encryption with `GOOGLE_CALENDAR_TOKEN_KEY`; plaintext is never stored.
- Provider-neutral links and a coalescing CREATE/UPDATE/DELETE outbox project only dated, calendar-visible FAMILY TASK/EVENT records. PRIVATE, undated, recurring and Family Log data are excluded.
- Cron retries use exponential backoff. D1 remains authoritative and Google failures never roll back task writes.
- `calendar_sync_state.sync_token` is reserved for Wave98 incremental inbound sync; inbound changes, conflicts, deletion and recurrence remain Wave98 work.
