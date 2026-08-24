# Family TODO LINE v12.35 Cloudflare D1 Wave11

## 機能移植・細部補完

- LIFF `/liff` 入口で既存のWorkerセッションが有効ならLINE IDトークンを再検証せずトップへ遷移
- 買い物登録を複数商品一括登録に対応
- 商品名＋数量を行単位で追加/削除可能
- カテゴリー・期限・関連タスク・メモを一括登録の共通項目として指定可能
- 関連タスクを選択すると、期限未指定時はタスクの日付を買い物期限へ引き継ぐ
- 買い物一覧に関連タスク名を表示
- `/app/shopping_new.php` も同じ一括登録フォームへ統一
- 既存の単品 `action=add` API は互換性のため維持
- 買い物完了/未完了時に `shopping_completion_history` へ履歴を記録

## DB

新規migrationは不要。既存の `shopping_items.task_id`、`shopping_completion_history` を利用。
