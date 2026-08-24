# Family TODO LINE Cloudflare D1 Wave15

## LINE通知

- タスク登録・編集時に「LINE通知日時」を任意指定できます。
- 指定日時になると、担当者全員へタスクの詳細をLINE Pushします。
- 伝言登録時に「LINE通知日時」を任意指定できます。
- 個人宛てはそのメンバー、家族全員宛ては投稿者を除く有効メンバーへPushします。
- 伝言をタスクへ変換した場合、通知日時をタスクへ引き継ぎます。
- 変換元の伝言通知は重複送信しないようキャンセルします。

## Cron

Wrangler設定は5分間隔です。

```text
*/5 * * * *
```

Cron実行時にD1の `notifications` から `notify_at <= 現在時刻` の未送信通知を処理します。

## GitHub / Cloudflare

mainへファイルを反映後、CloudflareのDeployが `npm run deploy` を実行する構成なら、D1 migration `0004_line_reminders.sql` も自動適用されます。

既存D1のデータは削除しません。
