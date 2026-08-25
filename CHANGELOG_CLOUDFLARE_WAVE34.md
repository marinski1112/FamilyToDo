# Family TODO LINE Wave34

## デプロイ
- `npm run deploy` を維持。D1 remote migration を先に適用してから Worker を deploy する構成を明示。
- Wave34 Migration `0010_wave34_notification_lifecycle.sql` を追加。

## 通知ライフサイクル
- 通知OFF/停止メンバーの pending/retry 通知を cancelled 化。
- 削除済み/完了済みタスク向け通知を cancelled 化。
- 削除済み伝言向け通知を cancelled 化。
- target検索用indexを追加。
- 未来日時のみ通知予約を受け付ける。

## メンバーライフサイクル
- メンバー停止時に保留通知をキャンセル。
- メンバー削除時にも保留通知をキャンセルしてから削除。
- 活動ログへ停止/再開/削除を記録。

## タスク/定期タスク
- タスク削除のカスケード内容を活動ログへ記録。
- 定期タスク削除時に子タスクの担当者・完了履歴・持ち物・買い物関連履歴も明示的に整理。
- イベント概念は引き続き存在しない。

## UI/スマホ
- date/datetime/time/number/url等のフォーム幅を共通化。
- iPhone/LINE内ブラウザでカード外へネイティブ入力がはみ出さないよう補強。
- 2列日時入力はスマホでは1列化。
- 下部6メニュー、カード、ページ見出しのスマホ余白を再調整。

## 未実装/残差
- 元v12.35との完全な画面ピクセル一致ではなく、操作フローとデータ整合性を優先して残差を整理。
- Cron通知はWorker scheduled()を使用。Cloudflare側cron設定の確認は別途必要。
