# Cloudflare Wave110 — v12.129.0-wave110

## D1 Free query safety

- Apply and rollback now pack work dynamically against a **40 statement** ceiling. Every statement inside `DB.batch()` is counted separately.
- Apply reserves family/batch/provenance/progress/activity overhead, then estimates each event as task + provenance, plus recurrence rule and each EXDATE.
- Rollback estimates missing/edited, normal, and recurring entries independently and advances its cursor only over processed rows.
- Responses expose both the invocation's actual `query_count` and `query_budget_max: 40`.

## TimeTree normalization

- Deterministic parsing accepts attached titles, separator suffixes, ranges, NFKC full-width input, and wave-dash variants.
- An explicit start with no explicit end becomes timed with `end_at === start_at`; no duration is inferred. Durations are applied only when selected, and “変更しない” remains available.
- Empty range titles preserve the original title, and already-timed or recurring ICS entries remain outside normalization candidates.

## Month calendar

- Non-all-day single entries show `HH:mm` before the event icon/title; recurring occurrences use their template wall-clock time.
- Matching title-time prefixes are suppressed in display only, while mismatches remain visible.
- Multi-day entries show the time only on the first overall segment. Accessible labels match visible content.

## Schema

No migration. Latest remains `0036_wave108_calendar_ics_import.sql`.
