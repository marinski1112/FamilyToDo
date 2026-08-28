# Cloudflare Wave115 — 12.134.0-wave115

- Added per-member, encrypted Google Tasks OAuth and explicit task-list discovery/selection.
- Added bounded `updatedMin` inbound sync, overlap and etag dedupe, manual lease, conflict/tombstone handling, PRIVATE-by-default mapping, and Calendar-loop prevention.
- Added compact Google Tasks integration settings and exact due-date/Voice Match guidance.
- Added PET scenes only for enabled overview quick types in the value-less MEAL/BATH/MEDICINE/WATER allowlist, with subject names and shared domain validation.
- Added safe Google Home linked-member and last-recorder diagnostics without email, voice identity, tokens, or payloads.
- Added append-only migration `0038_wave115_google_tasks_voice_inbox.sql`.
