# Google Home / Gemini 音声操作（Wave96 PoC）

## 構成と対応範囲

Wave96 は Google Home の **Cloud-to-cloud** 連携です。`assistant.event.OkGoogle` → `device.command.ActivateScene` → Family TODO Scene → `action.devices.EXECUTE` → Worker fulfillment → Family TODO domain action の順で実行します。Script Editor から Worker URLを直接呼びません。

対象は active な BABY / CHILD の睡眠開始・終了と、active な「ちょこっと家事」の記録だけです。タスク（PRIVATEを含む）、予定、Family Log本文はSYNCしません。連携はOWNER/ADMINに限定せず、ログイン中の本人が同意できます。共有Google Homeでは話者と linked member が一致しないことがあり、記録者は常に連携したmemberになります。

## Worker secrets / configuration

```sh
npx wrangler secret put GOOGLE_HOME_CLIENT_ID
npx wrangler secret put GOOGLE_HOME_CLIENT_SECRET
npx wrangler secret put GOOGLE_HOME_REDIRECT_URI
```

`GOOGLE_HOME_REDIRECT_URI` はGoogleから指定される account-linking callback URLを**完全一致**で設定します。値やtokenをリポジトリ、一般ユーザー画面、health応答へ表示しないでください。

## Google Home Developer Console

Cloud-to-cloud integrationを作成し、次を設定します（公開ホストは例として `https://familytodo.example`）。

- Fulfillment URL: `https://familytodo.example/api/google-home/fulfillment`
- Account linking: OAuth 2.0 Authorization Code flow
- Authorization URL: `https://familytodo.example/oauth/google/authorize`
- Token URL: `https://familytodo.example/oauth/google/token`
- Client ID / Client secret: Worker secretsと同じ値
- Scope: Wave96では任意の識別用scope（例 `familytodo.google-home`）。Family TODOは権限を固定しており、task dataは公開しません。

Google Homeアプリで「Works with Google Home」からintegrationを追加し、LINEログイン済みFamily TODO画面で同意します。SYNC後に表示されたScene名をGoogle Homeアプリで確認してください。Scene名の認識は実機・言語設定で確認が必要です。

## Script Editorへ貼る例

`devices` は実際にSYNCされた表示名（必要ならGoogle Home UIが示す部屋/家サフィックスを含む候補）へ置換します。

### ゆうま寝た

```yaml
metadata:
  name: ゆうま睡眠開始
  description: Family TODOに睡眠開始を記録

automations:
  starters:
    - type: assistant.event.OkGoogle
      eventData: query
      is: ゆうま寝た

  actions:
    - type: device.command.ActivateScene
      devices:
        - ゆうま寝た
      activate: true
```

### ゆうま起きた

```yaml
metadata:
  name: ゆうま睡眠終了
  description: Family TODOに睡眠終了を記録

automations:
  starters:
    - type: assistant.event.OkGoogle
      eventData: query
      is: ゆうま起きた

  actions:
    - type: device.command.ActivateScene
      devices:
        - ゆうま起きた
      activate: true
```

### ゴミ出しやった

```yaml
metadata:
  name: ゴミ出し完了
  description: Family TODOにちょこっと家事を記録

automations:
  starters:
    - type: assistant.event.OkGoogle
      eventData: query
      is: ゴミ出しやった

  actions:
    - type: device.command.ActivateScene
      devices:
        - ゴミ出し完了
      activate: true
```

`home.execution.Webhook` は公式schemaに存在しないため使用しません。

## 動的読み上げの制約

Google Home Script Editorには、Worker response本文を任意テキストとしてaction間へ渡してそのまま読み上げる公式Webhook actionはありません。Wave96はcommand executionのみを対象にします。「今日の予定を教えて」等の動的readbackは、Google Calendar連携を次フェーズで実装します。

## 実機テスト

1. migration `0032_wave96_google_home.sql` を適用し、3 secretsを設定してWorkerをdeployする。
2. Developer ConsoleのTest integrationを有効化し、Google Homeアプリでaccount linkする。
3. 管理 → 外部連携で「連携中」、linked member、連携日時を確認する。
4. HomeアプリにBABY/CHILDの「寝た」「起きた」とactive choreの「完了」Sceneだけがあることを確認する。PET、inactive chore、task titleがないことも確認する。
5. 上記scriptsを貼り、各フレーズを発話する。Family Logで開始、終了（SLEEP 1件）、HOUSEWORK 1件とcreated_byを確認する。
6. 同一Google requestの再送でFamily Logが増えないこと、別family IDのSceneが失敗することを確認する。
7. 管理画面の「連携解除」またはDISCONNECT後に古いaccess/refresh tokenが拒否され、過去ログが残ることを確認する。
