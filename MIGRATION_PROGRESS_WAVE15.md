# Wave15 migration progress

## Implemented
- [x] Task reminder_at
- [x] Message reminder_at
- [x] Notification rows per recipient
- [x] Cron every 5 minutes
- [x] Official LINE push through existing LINE_ACCESS_TOKEN
- [x] Task detail notification content
- [x] Message content notification
- [x] Task edit re-queues pending notification
- [x] Converted message notification cancellation

## Deployment
1. GitHub mainへファイルを上書き
2. Cloudflare Pages/Workers buildが完了することを確認
3. D1 migration 0004_line_reminders.sql が `npm run deploy` の migrations apply で適用される
4. Worker Variables の `NOTIFY_MODE` は wrangler.jsonc で scheduled
5. Cron trigger は 5分間隔
