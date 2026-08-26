# Cloudflare Wave69

Version: **12.88.0-wave69**

## Shopping add UI
- Product URL input is hidden by default behind a compact `🔗 URL` button for each product row.
- URL opens as a small anchored popover and can be closed independently.
- `＋ 商品を追加` no longer focuses the newly appended product-name input and does not intentionally scroll the page.
- Multiple blank product rows can therefore be prepared before entering names/quantities.
- Shopping batch controller moved from inline template JavaScript to `public/assets/shopping-new.js`.

## Notification settings controller
- Notification settings submit controller moved to `public/assets/settings-notifications.js`.
- Browser-script validation now covers shopping-new and notification settings.

## Admin lifecycle diagnostics
- Added `/app/settings_diagnostics.php` for OWNER/ADMIN.
- Read-only diagnostics include:
  - duplicate pending/retry notification groups
  - orphan pending notifications
  - stale recurrence exception links
  - orphan recurrence rules
  - stale message conversion pointers
  - stale task-linked shopping/item pointers
  - duplicate deleted completion archive groups
  - archive member/family mismatches
  - orphan assignee links
- Added a `データ診断` entry to the management page.
- Diagnostics intentionally do not treat a missing live entity as an archive orphan because `deleted_completion_history` is designed to survive live-row deletion.

## Validation
Passed:
- `npx --no-install tsc --noEmit`
- `npm run check:browser-js`
- migrations 0001–0015 applied to local SQLite
- all Wave69 diagnostics SQL executed against the migrated schema

## Migration
No new D1 migration.
Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
