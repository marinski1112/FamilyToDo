# Cloudflare D1 Wave24

## 実装
- 定期タスクの各発生日について担当者別の完了状態をD1に保存。
- 定期タスクにも通常タスクと同じ `ANY / ALL` 完了条件を適用。
- 定期タスクのチェック解除時に自分の完了だけを取り消し、ALL条件を再評価。
- 定期タスクの完了・未完了を activity_logs に記録。
- 既存の通知Cron（5分間隔）・リトライ処理は維持。

## D1
新規 migration:
`0007_wave24_recurrence_completion.sql`

GitHubへ更新後、Cloudflare側でD1 migrationが自動適用されない構成の場合は、
Deploy後に対象DBへ migration apply が必要です。
