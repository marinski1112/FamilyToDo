# Cloudflare Wave76

Version: **12.95.0-wave76**

## Family Log 500 hotfix
The Family Log GET route failed before rendering because the running-timer query joined:

- `family_log_timers x`
- `family_log_subjects s`

but used unqualified `family_id`, `status`, and `subject_id` predicates.

Both joined tables contain `family_id`, so SQLite/D1 raises:

`ambiguous column name: family_id`

The query now explicitly uses:
- `x.family_id`
- `x.status`
- `x.subject_id`

for both the all-subject and selected-subject variants.

## Runtime regression check
`/__cf/db-runtime-health` now includes `family_log_page_timer_join`, which executes the same JOIN shape with qualified aliases. This makes this class of page-specific SQL regression visible before device QA.

## Validation
Passed:
- `npx --no-install tsc --noEmit`
- `npm run check:browser-js`
- fresh SQLite migrations 0001–0017
- Family Log timer query with no subject filter
- Family Log timer query with subject filter
- old unqualified query reproduced the exact `ambiguous column name: family_id` failure
- `PRAGMA foreign_key_check`

## Migration
No new D1 migration.
Latest remains `0017_wave75_family_log.sql`.
