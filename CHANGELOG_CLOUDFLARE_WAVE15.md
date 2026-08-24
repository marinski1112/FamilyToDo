# Family TODO LINE Cloudflare D1 Wave15

- LINE通知cronを実運用モードへ変更（5分間隔）。
- タスク登録・編集時に担当者向けLINE通知日時を指定可能。
- 指定日時にタスク詳細を担当者へPush通知。
- 伝言登録時に宛先向けLINE通知日時を指定可能。
- 家族全員宛ての場合は投稿者を除く有効メンバーへ通知。
- 伝言→タスク/買い物変換時の元伝言通知をキャンセルし、タスク変換では通知日時を引き継ぎ。
- D1 migration 0004_line_reminders.sql を追加。
- 通知日時はAsia/Tokyo基準の `YYYY-MM-DD HH:mm:ss` で保存。
