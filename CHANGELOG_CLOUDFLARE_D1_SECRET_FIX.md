# Cloudflare D1 Secret deploy fix

## 修正
- `wrangler.jsonc` の `secrets.required` を削除しました。
- Git/Cloudflare Workers Builds から `wrangler deploy` する際、デプロイ前の必須Secret検証で停止しない構成にしました。
- Secret本体はCloudflare DashboardのWorkerの「Variables and Secrets」に登録したものをランタイムで参照します。

## 注意
- Secret名は `APP_SECRET`, `LINE_ACCESS_TOKEN`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_LIFF_ID`, `NOTIFY_SECRET` のままです。
- Secretの値はZIP/リポジトリへ入れません。
- DashboardでSecretを追加した後、対象Workerへ「Deploy」が適用されていることを確認してください。
- Cloudflare Environmentsを使っている場合、Production/PreviewごとにSecretは別管理です。
