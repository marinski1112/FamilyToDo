# Wave55 Residual Analysis

## 今回の調査結果

Wave54の定期タスク送信コードを静的に再確認した。

- `/app/recurring.php` のWorker routeは存在する。
- POST handlerも存在する。
- Wave54のinline JavaScript自体は構文上有効 (`node --check` で確認)。
- TypeScriptもコンパイル可能。
- create SQLの `tasks` / `recurrence_rules` の列数・値数は既知の18/19不整合とは異なり、静的には整合している。

したがって、「ボタン押下後Cloudflare LiveにPOSTが1件も現れない」という観測は、DB/POST handler到達後の問題より、ブラウザ側でリクエスト自体が開始されていない可能性を優先して扱うべきである。

Wave55ではこの切り分けを容易にするため、JS fetch + 通常form POSTの二重経路とroute入口ログを実装した。

## Wave55適用後に見るもの

Cloudflare Liveで以下のログを確認する。

`{"event":"recurring_route_post", ...}`

### A. ログが出る場合

リクエストはWorkerへ到達している。以後はHTTP status / D1 error / response bodyを追う。

### B. ログが出ない場合

Worker以前で送信が止まっている。画面に表示される状態文言を確認する。

- 「登録機能を準備しています…」が消えない: inline JS初期化前に停止。
- 「入力内容を確認しています…」まで: clickは動作したがsubmitに進んでいない。
- 「Cloudflareへ送信しています…」まで: fetch開始直前/通信層。

Wave55ではJSが完全に動作しなくても通常form POSTへフォールバックするため、入力済みのタイトル・開始日でボタンを押せばWorker routeへ到達する設計になっている。

## 継続残差

- 定期タスク作成処理の複数SQLを、失敗時に孤児taskを残さないライフサイクルへさらに強化する余地がある。
- 定期タスク編集時の子要素全置換は履歴archiveを行っているが、UI上で全置換であることの明示が弱い。
- occurrence例外日の通常タスク化は継続実装対象。
- 通知・招待の失効/取消・operation log retentionも継続対象。
- カレンダー複数日帯、スマホ表示密度、買い物/伝言詳細UIを継続確認する。
