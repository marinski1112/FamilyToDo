# Cloudflare Wave93 — 12.112.0-wave93

## Family Log UX Reduction

- Reduced the daily Family Log header from four management actions to one 44px settings gear and removed the duplicated eyebrow and subject metadata.
- Moved subject add/edit/hide, per-subject items, adult visibility, quick-chore administration, import, and import history access into `/app/settings_family_log.php` while preserving the importer route and APIs.
- Flattened quick recording, compacted native date navigation, removed explanatory metadata, collapsed the idle timer, retained the lazy collapsed dashboard, shortened chore aggregation, and combined history filters.
- Turned the settings top into a navigation hub by removing duplicate member, invitation, and recurring-task detail cards.

No migration or data-model change is included. Existing subjects, settings, logs, imports, chores, timers, permissions, and indexed pagination remain intact.
