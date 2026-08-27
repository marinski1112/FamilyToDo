# Cloudflare Wave94 — 12.113.0-wave94

## Family Log all-view
- Removed the implicit union of every subject's enabled quick types.
- Added explicit, independently stored overview promotion settings per subject.
- Kept quick chores first and reduced quick-button visual density while retaining a 44px tap target.

## CHILD sleep
- Added dedicated idempotent `sleep_start`, validated `sleep_adjust`, and `sleep_stop` actions backed by `family_log_timers`.
- CHILD sleep starts in one tap, persists across navigation, produces an ordinary `SLEEP` family log on stop, and keeps the stop actor as `created_by`.
- Added 12-hour warnings, 16-hour stop confirmation/correction, and a validated 48-hour correction boundary. Timers are never automatically stopped.

## Compatibility
- Generic labeled `TIMER` actions, imported SLEEP records, dashboards, history, subject IDs, and subjectless quick chores remain unchanged.
- Migration `0030_wave94_family_log_overview.sql` only adds subject overview settings with existing rows defaulted off.
