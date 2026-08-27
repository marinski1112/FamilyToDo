# Wave82 — 定期タスクから家族ログを記録して完了

- `task_family_log_templates` を追加し、定期タスクごとの任意の家族ログ内容を検索可能な列で保持します。
- `family_logs.task_family_log_template_id` と有効ログの部分ユニークインデックスで発生元追跡と二重送信耐性を追加しました。
- 定期タスク設定に「🐣 家族ログ連携（任意）」を追加し、日別タスクとカレンダー日詳細に「記録して完了」を表示します。
- 専用APIは occurrence IDだけを受け、現familyの occurrence → rule → task → template を解決します。既存のFamily Log完了helperを再利用し、失敗時には新規ログをsoft deleteします。
- Wave81/Wave82 smokeをまとめた `check:domain-smoke` をCIへ追加しました。
- Version: `12.101.0-wave82`。
