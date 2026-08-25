# Cloudflare D1 Wave18

- Shopping single-item API now persists product URL.
- Shopping list grouped by category and completed items collapsed.
- Shopping list keeps direct check-off and task/assignee/URL metadata.
- Notification Cron failures retry up to 4 times; 5th failure becomes `error`.
- Added notification attempt/error tracking migration.
- Shared date/time input sizing hardened for mobile/LIFF.
- Existing Wave17 calendar interaction and notification settings (ON/OFF only) retained.

## Deploy
`npm run deploy` applies migration `0005_wave18_notifications_retry.sql` before Worker deployment.

## Important
The new migration must be applied to the same D1 database. The repository deploy script already runs `wrangler d1 migrations apply DB --remote` before `wrangler deploy`.
