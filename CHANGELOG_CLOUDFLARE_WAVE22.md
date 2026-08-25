# Family TODO LINE Cloudflare D1 Wave22

## 今回の残差修正
- タスク完了処理を元版の `task_completions` ベースへ寄せ、`completion_mode=ANY/ALL` を実際の完了判定へ反映。
- タスクの再オープン時は本人の完了レコードを削除し、履歴は保持。
- 持ち物も `item_completions` を記録し、完了履歴と整合。
- タスク削除時に紐付く買い物・持ち物・担当者・完了履歴もまとめて削除。
- タスク追加画面に「誰か1人で完了 / 担当者全員が完了」を追加。
- 買い物画面に元版相当のカテゴリー別/日付別、カテゴリー・期限・担当者フィルターを追加。
- 買い物の期限切れ一覧を追加。
- 買い物からタスク化する導線を一覧に追加。
- 買い物URL、数量、担当者、タスク紐付けは既存のWave21実装を維持。
- TypeScript `tsc --noEmit` を通過確認。

## D1 migration
今回DBスキーマ変更なし。既存の `task_completions` / `item_completions` を利用するため追加SQLは不要。
