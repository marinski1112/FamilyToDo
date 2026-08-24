# Migration Progress Wave12

Wave12では、元PHP版の「担当者」と「日付に紐づくデータを横断表示する」設計をCloudflare版へ追加反映。

確認済み:
- shopping_assignees は既存D1 schemaに存在
- item_assignees は既存D1 schemaに存在
- shopping_completion_history / item_completion_history は既存D1 schemaに存在
- 今日/明日/カレンダーで完了チェック可能
- カレンダーでイベント・タスク・持ち物・買い物・祝日を同一日付から確認可能

次段階:
- 伝言→買い物変換
- 持ち物/買い物の担当者表示・編集のさらなるUI parity
- カレンダー日付詳細の並び替え・長押し等の元版操作
- 定期タスクUIの完全parity
- 通知/表示設定の細部parity
