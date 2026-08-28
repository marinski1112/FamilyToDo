# Google Home Cloud-to-cloud 個人テスト設定（Wave104）

Family TODOは **Scene traitのみ** のCloud-to-cloud test integrationです。BABY/CHILDの「<name>寝た」「<name>起きた」とactiveなちょこっと家事の「<name>完了」だけをSYNCし、`ActivateScene`で記録します。SceneはReport State非対応のため実装せず、QUERYは空のdevices応答です。

> Scene traitだけのintegrationは現在certification/release対象外です。当面は個人利用のtest integrationを目的とし、認証を通すための架空device type/traitは追加しません。certification submissionはWave104の範囲外です。

## Worker設定

Calendar OAuthとは完全に別のFamily TODO Home専用credentialを作り、次をsecret/environmentへ設定します。

```sh
npx wrangler secret put GOOGLE_HOME_CLIENT_ID
npx wrangler secret put GOOGLE_HOME_CLIENT_SECRET
npx wrangler secret put GOOGLE_HOME_PROJECT_ID
```

`GOOGLE_HOME_PROJECT_ID` はDeveloper Console project IDです。Workerは次の2つだけをproject IDから許可します。

- production: `https://oauth-redirect.googleusercontent.com/r/<PROJECT_ID>`
- test/sandbox: `https://oauth-redirect-sandbox.googleusercontent.com/r/<PROJECT_ID>`

従来の `GOOGLE_HOME_REDIRECT_URI` は移行互換用の完全一致値としてのみ利用できます。任意redirectや外部`next`は許可しません。

## Developer Console入力値

- Authorization URL: `https://familytodo.marinski1112.workers.dev/oauth/google/authorize`
- Token URL: `https://familytodo.marinski1112.workers.dev/oauth/google/token`
- Fulfillment URL: `https://familytodo.marinski1112.workers.dev/api/google-home/fulfillment`
- OAuth flow: Authorization Code
- Client ID / Secret: Calendar OAuthとは別のFamily TODO Home専用値
- Project ID: Developer Consoleのproject ID（Workerの `GOOGLE_HOME_PROJECT_ID` と一致）

同意画面は「Google」とFamily TODOを連携し、Googleによる睡眠・家事記録操作を許可することを明示します。未ログインならLINEログイン後、state/client_id/redirect_uri/response_typeを保った同一authorize URLへ戻ります。

## Test integration手順

1. Developer ConsoleでCloud-to-cloud integrationを作り、上記endpointと専用credentialを入力します。
2. projectのtest user/testerへ利用するGoogleアカウントを追加し、**Test integration** を有効化します。
3. Google Homeアプリの「Works with Google Home」からintegrationを選び、Family TODOのLINEログインと同意を完了します。
4. SYNC後、BABY/CHILDの睡眠Sceneとactiveな家事Sceneだけが表示されることを確認します。
5. `ActivateScene`を実行しFamily Logを確認します。同じGoogle request IDの再送は `external_command_receipts` により重複記録されません。
6. 管理 → Google Homeでlinked memberと安全な設定診断を確認します。

共有Google Homeでは話者とlinked memberが一致しない場合があり、記録者は連携memberです。task、予定、raw Family Log、PRIVATEデータはSYNCしません。

## Script Editor

必要に応じて `assistant.event.OkGoogle` の発話starterから、SYNCされたSceneに `device.command.ActivateScene`（`activate: true`）を送ります。Worker URLを直接呼ぶ非公式Webhookは使用しません。
`home.execution.Webhook` は公式schemaにないため追加しません。

## 動的読み上げ

Scene実行だけを対象とし、Worker応答を任意文として読み上げる機能はありません。予定の参照はGoogle Calendar連携を利用します。
