# Cloudflare Wave92 — 12.111.0-wave92

## Quick-record-first Family Log

- Reordered the mobile page so date and compact quick recording precede chores, timers, the dashboard, and history.
- The dashboard is collapsed by default. Its three SQL aggregate queries are lazy and run only after navigation with `dashboard=1`; no raw history is fetched for charts.
- Added the recorder filter to the all-family view and applied `created_by` consistently to its timeline and dashboard.

## Adult visibility

Migration `0029_wave92_family_log_settings.sql` adds the minimal family-level `show_adult_logs` preference, defaulting to ON for compatibility. OWNER / ADMIN users can change it in the Family Log display-settings sheet.

When OFF, adult chips, new-record choices, timers, and adult rows in the all-view timeline/dashboard are hidden using SQL predicates. No subject, log, member link, import provenance, or batch is modified. Re-enabling the preference restores the same adult subjects and history. Existing adult records remain editable without changing their subject if an edit sheet is already open.

## Compatibility and performance

- Wave90 import provenance/rollback and imported baby logs are unchanged.
- Wave91's 50-row pagination and `idx_family_logs_active_subject_type_occurred` remain intact.
- Adult filtering uses indexed subject lookups in D1 and never downloads 2,500 rows for Worker-side filtering.
