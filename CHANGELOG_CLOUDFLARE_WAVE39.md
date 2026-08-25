# Family TODO LINE Cloudflare Wave39

- Notification lifecycle: disabling a member's LINE notifications immediately cancels pending/retry notifications for that member.
- Notification lifecycle: admin bulk notification changes also cancel pending/retry work for members switched OFF.
- Legacy task deletion path now cleans shopping/item assignees and completion/history rows before deleting child records.
- Calendar FAB: initializes to a valid task-create URL before the first tap and still switches to the selected date when a day has been opened, preventing stale/empty href navigation in LINE WebView.
- Cache/version: family.css and calendar.css bumped to 12.58-wave39.
- No D1 migration added.
- Deploy remains `npm run deploy`.


## Wave40 residual hardening
- Japanese monthly business-day recurrence now excludes Japanese holidays, matching the XREA recurrence implementation.
- Legacy `/app/create.php`, `/app/join.php`, `/login_error.php`, and LIFF diagnostic routes are retained as Cloudflare compatibility aliases.
- Family creation now uses D1 `run().meta.last_row_id` instead of a follow-up `last_insert_rowid()` statement.
