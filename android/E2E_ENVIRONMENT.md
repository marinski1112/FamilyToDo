# Android E2E専用環境の準備

この環境はPR #1143のAndroid APIとAPKを実機で照合するためのものです。通常のPRプレビューは本番D1/R2を参照するため、書き込み試験には使いません。専用Workerは `familytodo-android-e2e.marinski1112.workers.dev`、専用R2は `familytodo-android-e2e`、D1も同名の新規DBとします。本番DBの複製や家族データの投入は不要です。

## 前提

- Cloudflareアカウントに新規D1とR2を作る。既存の `familytodo` DB・バケットを選ばない。
- E2E専用のLINE Login/LIFF設定を用意し、LIFF Endpoint URLを専用Workerの `/liff` にする。必要なLINE ID・Secretは専用WorkerのSecretsに設定し、PRやログに貼らない。通知も試す場合は本番とは別のLINE Botトークンを使う。
- 専用の `APP_SECRET` と `NOTIFY_SECRET` を生成し、専用WorkerのSecretsに設定する。本番のSecretをコピーしない。Google OAuth/Tasks、共有スタンプサービス、AIの本番接続先を設定しない。
- この手順は本番Worker、DB、R2、Cron、LINEの既存設定を変更しない。権限のある作業者が対象アカウントとコマンドを確認してから実行する。

## 作成と設定

1. CloudflareでD1 `familytodo-android-e2e` とR2 `familytodo-android-e2e` を新規作成し、D1 UUIDを控える。UUID自体はSecretではないが、別DBであることを本番ID `9d9d6de8-ff45-4dd6-9fec-0de70ee1d093` と照合する。
2. PRブランチをチェックアウトした環境で、`ANDROID_E2E_DB_ID=<新規D1 UUID> node scripts/android-e2e-config.mjs` を実行する。生成される `wrangler.android-e2e.generated.jsonc` はgit対象外。スクリプトは本番IDを拒否し、別名のWorker/R2とCronなし・Observability無効の設定を生成する。
3. 生成ファイルのWorker名、D1 ID、R2名、APP_URLを目視確認する。その後のみ `npx wrangler d1 migrations apply DB --remote --config wrangler.android-e2e.generated.jsonc` を実行する。これは**新規D1への書き込み**なので、IDが違えば中止する。
4. 専用WorkerのSecretsを個別に設定する。最低限の候補は `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`、`LINE_LIFF_ID`、`APP_SECRET`、`NOTIFY_SECRET`。LINE通知を試す時だけ専用の `LINE_ACCESS_TOKEN` を追加する。実際のログイン設定が揃うまでWorkerを実機テスト可能と扱わない。
5. `npx wrangler deploy --config wrangler.android-e2e.generated.jsonc` で**専用Workerだけ**を公開する。専用URLの `/__cf/health`、`/__cf/db-health`、`/__cf/db-schema-health` を確認し、認証前の `/api/android/v1/overview?month=2026-09` が401になることを確認する。既存の本番URLへはデプロイしない。

## E2E用APK

```sh
gradle -p android :app:assembleDebug \
  -PfamilytodoDebugOrigin=https://familytodo-android-e2e.marinski1112.workers.dev \
  -PfamilytodoIsolatedE2E=true
```

別アプリID `jp.marinski.familytodo.preview` で、本番用APKと併存します。Android CIにも `familytodo-android-e2e-unverified` という7日間の成果物があります。専用Worker・D1・R2・LINE設定が完了する前にはインストールしても正常なE2Eはできません。CIのデバッグ署名は実行ごとに変わり得るため、別のCI実行のAPKへ上書きできない場合はテスト用アプリをアンインストールして再インストールします。

E2Eでは新規のテスト家族でログイン、カレンダー・チェックリスト・伝言・写真・スタンプ・育児記録の保存と再取得、共有OFF、ログアウト、オフライン復帰を確認します。位置情報は自分の端末から実送信されるため、専用環境とテスト家族以外へ送られないことを確認してから開始します。Android 11のGalaxy A21を最初に使い、新しいOSでも権限・通知・再起動を回帰確認します。

専用環境での成功後も本番APIと内部配布APKの互換性確認、安定した署名鍵、WebとAndroidの残る機能差分が必要です。
