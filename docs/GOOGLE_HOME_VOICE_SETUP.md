# Google Home Cloud-to-cloud 実機設定（Wave113）

Family TODOは **Scene traitのみ** のCloud-to-cloud test integrationです。BABY/CHILDの「`<name>寝た`」「`<name>起きた`」とactiveなちょこっと家事の「`<name>完了`」だけをSYNCし、`ActivateScene`を既存のFamily Log domain helperで記録します。PET/ADULT、inactive項目、タスクや予定は公開しません。

> Googleの制約上、Scene traitだけのintegrationはcertification/release対象外です。当面はDeveloper ConsoleのTest integrationと個人家庭利用が目的です。認証のための架空device type/traitは追加しません（架空light/switchも追加しません）。

## Cloudflare Worker設定

Google Calendar用の `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` とは完全に別のGoogle Home専用credentialです。

```sh
npx wrangler secret put GOOGLE_HOME_CLIENT_ID
npx wrangler secret put GOOGLE_HOME_CLIENT_SECRET
npx wrangler secret put GOOGLE_HOME_PROJECT_ID
```

`GOOGLE_HOME_PROJECT_ID` はsecretではなく、この環境では `family-todo-home` です。Workerはproject IDから生成した次の2つだけを許可します。

- 本番callback: `https://oauth-redirect.googleusercontent.com/r/family-todo-home`
- テストcallback: `https://oauth-redirect-sandbox.googleusercontent.com/r/family-todo-home`

従来の `GOOGLE_HOME_REDIRECT_URI` は移行互換用の完全一致値としてのみ利用できます。任意redirectは許可しません。

## Developer Console入力値

| 項目 | 入力値 |
| --- | --- |
| Authorization URL | `https://familytodo.marinski1112.workers.dev/oauth/google/authorize` |
| Token URL | `https://familytodo.marinski1112.workers.dev/oauth/google/token` |
| Fulfillment URL | `https://familytodo.marinski1112.workers.dev/api/google-home/fulfillment` |
| OAuth flow | Authorization Code |
| Client ID | Cloudflare `GOOGLE_HOME_CLIENT_ID` と同じ |
| Client Secret | Cloudflare `GOOGLE_HOME_CLIENT_SECRET` と同じ |
| Project ID | `family-todo-home` |

Token endpointは `client_secret_post` とHTTP Basicに対応します。authorization codeは5分・一回限り、access tokenは約1時間です。raw code/token/secretはDBへ保存せずSHA-256 hashだけを保存します。refresh tokenはrotateせず、並行refreshでも互いを無効化しない署名付きaccess tokenを返します。正常refreshは日常activity logを増やさずsafe console categoryだけを記録します。

未ログインなら、元の同一origin authorize URLを `next` としてLINEログインし、`state` / `client_id` / `redirect_uri` / `response_type` を保って同意画面へ戻ります。`scope`、`user_locale` などの追加parameterは許容しますが、権限昇格には使いません。client ID、callback完全一致、`response_type=code` は厳格に検証します。

## Test integration実機手順

1. Developer ConsoleでCloud-to-cloud integrationと上表のAccount linking設定を保存します。
2. Fulfillment URLを保存します。
3. test userを登録し、**Test integration** を開始します。
4. Google Homeアプリの「Works with Google Home」からintegrationを選びます。
5. Family TODOのLINEログインとOAuth consentを完了します。
6. Googleからの初回SYNC後、Home Graph/Test SuiteでSceneが入ったことを確認します。
7. まずHome appまたはTest SuiteからScene activationを実行します。
8. Family TODOのFamily Logで睡眠開始・終了または家事記録を確認します。
9. 管理 → 外部連携 → Google Homeで最終SYNC、Scene数、最終実行結果を確認します。
10. DISCONNECTでlink tokenだけが失効し、Family TODO account/dataが残り、再linkできることを確認します。

初期確認用Scene名の例は「ゆうま寝た」「ゆうま起きた」「ゴミ出し完了」です。どの自然文が確実に起動するかはGoogle側の音声認識に依存し、コードは特定phraseを保証しません。実機確認後にname/nicknameを調整し、Wave113では推測による大量aliasを追加しません。

Scene IDは `ft:sleep:start:<id>` / `ft:sleep:stop:<id>` / `ft:chore:<id>` で、表示名を変えても不変です。同じGoogle `requestId` + commandの再送は `external_command_receipts` により二重記録されません。QUERYはSceneに架空stateを返さず空のdevices応答です。Scene一覧を変更した後はRequest Sync APIが未実装のため、現時点では再linkまたはGoogle側の再同期が必要になる場合があります。

共有スピーカーの話者identityはFamily TODOへ提供される前提にしません。すべてOAuthで連携したmemberの操作として記録します。

## Script Editor / 読み上げの範囲

必要な実機検証では `assistant.event.OkGoogle` starterからSYNC済みSceneへ `device.command.ActivateScene` を送れます。Workerを直接呼ぶ非公式 `home.execution.Webhook` は使いません。SceneはReport State非対応です。Scene integrationに動的読み上げ機能はありません。
