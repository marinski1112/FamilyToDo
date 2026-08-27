# Cloudflare Wave74

Version: **12.93.0-wave74**

## PWA foundation
- Added `/manifest.webmanifest` with standalone display and `/app/tasks.php` start URL.
- Added root `/sw.js` service worker.
- Added static-asset caching only; authenticated HTML/API responses are intentionally not cached.
- Added push notification display and notification-click navigation.
- Added global service-worker registration through `/assets/pwa.js`.

## Web Push
- Added standards-based Web Push subscriptions and delivery alongside LINE.
- Member delivery channel is now `LINE` or `WEB_PUSH`; existing users remain `LINE` by default.
- Added notification-settings UI for:
  - enabling Web Push on the current device
  - disabling the current device
  - sending a test notification
  - switching personal delivery channel
- Web Push subscriptions are stored per member/device and dead 404/410 subscriptions are removed.
- Scheduled notifications send through the member-selected channel.
- Web Push can therefore avoid consuming LINE Official Account message quota when selected.

## VAPID
- Added dependency-free RFC8291/RFC8292 sender using Cloudflare Web Crypto + fetch.
- Added `npm run generate:vapid` helper.
- Required runtime settings:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`

## Migration
New D1 migration:
- `0016_wave74_web_push.sql`

It adds:
- `members.notification_channel`
- `web_push_subscriptions`

## Validation
- `npx --no-install tsc --noEmit` passed.
- `npm run check:browser-js` passed, including `pwa.js` and `sw.js`.
- Fresh local SQLite migrations 0001-0016 applied successfully.
- `PRAGMA foreign_key_check` returned no rows.
