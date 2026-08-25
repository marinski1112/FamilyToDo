# Family TODO LINE Cloudflare D1 Wave31

## 今回の変更

- 「予定 / イベント」をアプリ上の独立概念から廃止。
- タスクを唯一の予定情報として扱う構造へ統一。
- タスクの日時・終日・複数日・場所・メモ・担当者・カレンダー表示をそのまま利用。
- カレンダーからイベントを表示・登録する処理を削除。
- カレンダー下部の独立した「＋ 登録」エリアと固定＋ボタンを削除。
- 日付詳細の＋から、その日付のタスクを登録する導線を維持。
- 日付詳細の祝日名表示、前日/翌日移動、スワイプを維持。
- 月表示の左右スワイプを維持。
- 買い物の関連付け先をタスクへ一本化。
- タスク作成時の買い物複数登録・URL・担当者・通知を維持。
- タスク編集時に紐付く買い物・持ち物の担当者同期を維持。
- LIFF `/liff?next=...` を、ログイン済みの場合でも `next` へ遷移するよう修正。
- これにより、LINEの個別リッチメニューから各ページへ直接遷移可能。
- 日付入力は既存のWave30のコンパクト指定を維持。

## D1ライフサイクル

`migrations/0008_wave31_task_only.sql` を追加。

既存イベントがある場合は、まず対応するタスクへ情報を移し、買い物・持ち物・伝言の関連もタスクへ寄せた後、アプリが参照する `event_id` をNULL化します。

`events` / `event_members` テーブル自体はWave31では削除しません。データ消失を避けるための保留状態です。十分な稼働確認後の別Waveで削除可能です。

## LIFF入口

- 今日: `/liff?next=/today.php`
- 明日: `/liff?next=/tomorrow.php`
- カレンダー: `/liff?next=/app/calendar.php`
- 買い物: `/liff?next=/app/shopping.php`
- 伝言: `/liff?next=/app/messages.php`
- 管理: `/liff?next=/app/settings.php`

実際のLIFF Endpoint URLには、使用しているWorkerドメインを先頭につけてください。

## 注意

- `wrangler.jsonc` のD1 bindingは変更していません。
- Secretsも変更していません。
- デプロイ前にTypeScriptコンパイル確認済み。
