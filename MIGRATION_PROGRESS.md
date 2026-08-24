# v12.35 Cloudflare D1 migration progress

## Wave 1 — functional core
- Cloudflare Worker routing and D1 binding
- encrypted cookie session and CSRF token
- LINE LIFF ID-token verification + existing-member lookup
- family create / join
- top page
- 今日 / 明日の準備
- task creation + task detail + task edit/delete
- item creation + item edit/delete
- task/item/shopping completion toggles
- compatibility endpoint `/app/api/check.php`
- task reorder endpoint `/app/api/reorder.php`
- calendar month view with 6-week grid, day selection, detail, task/event creation entry points
- event creation
- messages list/post
- shopping list/add/toggle + shopping edit/delete
- basic settings: profile, member suspend/reopen/delete, notification settings
- D1 initial schema + v12.35 compatibility migration

## Still pending
- exact visual parity with every v12.35 PHP screen
- full recurring-task creation/edit/occurrence generation parity
- full shopping/category/group behavior
- invitation token join flow parity
- family member role management parity
- LINE Webhook event business logic and push notifications
- scheduled notification processing
- diagnostics/reorder UX parity
- XREA bottom-ad behavior replacement for Cloudflare
- comprehensive end-to-end testing with real data

## Migration safety rule
The original XREA/PHP implementation remains the reference implementation and is not modified by this migration work. DNS and LINE Webhook are intentionally not cut over until the Cloudflare version passes functional testing.

## Wave 3 — automation and family operations
- invitation token generation + /family/join.php token flow
- recurring task management UI backed by recurrence_rules
- LINE webhook signature verification and basic text replies
- webhook activity logging into activity_logs
- scheduled notification dispatcher via LINE Push API
- 15-minute Cron Trigger configured (execution remains disabled while NOTIFY_MODE=manual)
- D1 performance indexes for recurring/invitation/notification queries
