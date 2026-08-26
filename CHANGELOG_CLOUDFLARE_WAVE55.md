# Family TODO LINE Wave55

Version: `12.74.0-wave55`

## Recurring task submission hardening

Wave54で「定期タスクを作成」を押してもCloudflare LiveにPOSTログが現れないケースが報告されたため、送信経路を二重化した。

- `/app/recurring.php` のフォームに `method="post"` / `action="/app/recurring.php"` を明示。
- JavaScript fetch が利用可能な場合は従来どおりJSON POSTを使用。
- inline JavaScriptが停止・未実行の場合でも通常HTML form POSTでWorkerへ到達するフォールバックを追加。
- native form POSTでも `weekdays` / `week_numbers` / `monthdays` / `assignees` の単数・複数値を正規化。
- native form POSTでも定期タスクに紐づく買い物・持ち物を復元可能にした。
- HTML form POST成功時は `/app/recurring.php?saved=1` へリダイレクトし、保存完了表示を出す。
- fetch時は `credentials: same-origin`, `cache: no-store`, `Accept: application/json` を明示。
- 15秒の通信タイムアウトと状態表示を追加。
- ボタン押下時に「入力内容を確認」「Cloudflareへ送信」と状態が見えるようにした。
- `src/index.ts` の recurring POSTルート入口に、安全なメタ情報のみの `console.log` を追加。Cloudflare Liveで `event=recurring_route_post` を確認できる。
- formのブラウザ内蔵validationだけで送信が止まるケースを避け、サーバー側validationを最終防衛線にした。

## Verification

- `npx --no-install tsc --noEmit` passed.
- recurring pageのinline JavaScriptを抽出し `node --check` passed.
- DB migration追加なし。最新migrationはWave52の `0015_wave52_remove_legacy_event_fk.sql` のまま。
