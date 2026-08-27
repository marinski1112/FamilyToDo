# Cloudflare Wave75

Version: **12.94.0-wave75**

## Family Log MVP
- Added `/app/family_log.php` as the sixth primary page.
- Added chronological family logging without reusing the legacy DB events concept.
- Added optional family-log subjects for children/adults/pets/other profiles.
- Added quick log types:
  - milk
  - breastfeeding
  - meal
  - diaper
  - sleep
  - bath
  - temperature
  - medicine
  - memo
- Added daily timeline and compact daily summary.
- Added edit and soft-delete for recorded logs.
- Added sleep/breastfeeding timers. Stopping a timer writes a normal family-log row with duration.
- Logs can optionally link to a physical task/event or a recurring occurrence.
- Added Family Log to home and bottom navigation.
- Added Family Log to posting/content management.

## PWA / Web Push baseline carried forward
Wave75 includes the Wave74 PWA/Web Push work because Wave74 was an intermediate implementation after the last delivered Wave73 baseline:
- manifest + service worker
- Web Push subscription and delivery
- LINE/Web Push delivery-channel selection
- VAPID tooling
- migration `0016_wave74_web_push.sql`

## Migration
New migrations since the previously delivered Wave73:
- `0016_wave74_web_push.sql`
- `0017_wave75_family_log.sql`

`0017` adds:
- `family_log_subjects`
- `family_logs`
- `family_log_timers`

## Validation
- `npx --no-install tsc --noEmit` passed.
- `npm run check:browser-js` passed including `family-log.js` and service-worker JS.
- Fresh local SQLite migrations 0001-0017 applied successfully.
- Family-log subject/log/timer SQL smoke tests passed.
- `PRAGMA foreign_key_check` returned no rows.
