# Google Home Cloud-to-cloud 実機設定（Wave114）

## Developer Console 設定確認

Family TODO fulfillment がSYNCする実device typeは **`action.devices.types.SCENE`**、traitは `action.devices.traits.Scene` です。Developer ConsoleでDevice typeにSceneを選べる場合はSceneを選択してください。**Computer / Speaker / Tablet / Window** をFamily TODOの架空deviceとして選んだり、Sceneが表示されない場合に架空typeでcertificationを回避したりしません。Console側の提供状況を確認してから進めます。

| 項目 | 設定値 |
|---|---|
| Integration | `Family TODO` |
| Client ID | `Family_ToDo`（Cloudflare `GOOGLE_HOME_CLIENT_ID` と完全一致） |
| Client Secret | Cloudflare `GOOGLE_HOME_CLIENT_SECRET` と完全一致 |
| Project ID | `family-todo-home` |
| Authorization URL | `https://familytodo.marinski1112.workers.dev/oauth/google/authorize` |
| Token URL | `https://familytodo.marinski1112.workers.dev/oauth/google/token` |
| Fulfillment URL | `https://familytodo.marinski1112.workers.dev/api/google-home/fulfillment` |
| Scope | `devices` |
| App Flip | 未使用 |
| Local fulfillment | 未使用 |

Token endpointはclient secretのform送信とHTTP BasicのON/OFF両方に対応します。`scope=devices` はAccount Linkingリクエストの追加parameterとして許容しますが、Wave114でFamily TODO内の権限を分離するscopeではありません。authorization codeは5分・一回限り、access tokenは約1時間です。raw code/token/secretは保存・診断表示しません。

## Scene catalog

音声対象はactiveな **BABY / CHILDだけ**です。PET / ADULT / OTHERは対象外です。active対象が家族内で1人なら表示名から名前を省略し、2人以上なら必ず名前を付けます。IDにはどちらの場合もsubject IDを保持します。

* 睡眠: `寝た` / `起きた`（複数なら `ゆうま寝た` / `ゆうま起きた`）
* BABY排泄: `DIAPER` + `WET` / `DIRTY`
* CHILD排泄: `TOILET` + `WET` / `DIRTY`
* 現在: `ft:log:wet:<subject_id>:now` / `ft:log:dirty:<subject_id>:now`
* 1時間前: `ft:log:wet:<subject_id>:m60` / `ft:log:dirty:<subject_id>:m60`
* ちょこっと家事: 従来どおり `ft:chore:<id>`

`enabled_types_json` でBABYのDIAPERまたはCHILDのTOILETが無効なら排泄SceneをSYNCせず、EXECUTE時にも再検証します。名前とnicknameはUnicode code pointで60文字以内です。自然な補助名は「おしっこを記録」「排尿記録」「睡眠開始」「起床記録」など少数に限定し、名前には「OK Google」「Hey Google」「Google」を含めません。

## Cloud-to-cloud Sceneの制約

Cloud-to-cloud Sceneの `action.devices.commands.ActivateScene` がfulfillmentへ渡す動的parameterはactivate/deactivateだけです。自由な音声文をFamily TODOへそのまま転送できません。「1時間前」はWave114では固定のpreset Sceneであり、nowとminus 60分だけをallowlistします。30分、37分、昨日、具体時刻、量（140ml）などの任意値は解析しません。任意時刻・量にはFamily AIを利用できる別入力チャネルが必要です。Google Home向けの非公式NLU webhook（`home.execution.Webhook`）は作りません。

Script Editorの `assistant.event.OkGoogle` は`device.command.ActivateScene` で固定queryからpreset Sceneを起動する補助には使えますが、queryから可変時間をcaptureしてActivateSceneへ渡せるとは仮定しません。Wave114ではScript Editorは必須ではありません。

## 初回Account Linking（Wave114 deploy後）

1. Wave114をdeployし、上記Console設定とCloudflare secretsを再確認します。
2. Developer Consoleでtest userを登録し、**Test integration** を開始します。
3. Google Homeアプリで「デバイス」→「追加」→「Works with Google Home」を開き、`Family TODO` を選びます。
4. Family TODOのLINEログインを完了し、連携画面で、Googleからの記録者になるmemberを確認して「連携する」を押します。共有スピーカーのvoice identityではなく、このlinked memberが `created_by` になります。
5. Googleの初回SYNC完了後、Home appまたはHome Graph/Test SuiteでScene一覧と件数を確認します。初回link前にWave114 catalogをdeployするため、Request Sync APIは不要です。
6. 対象が1人なら「寝た」「おしっこ記録」「1時間前のうんち記録」、複数なら名前付きSceneがあることを確認します。PETや無効typeがないことも確認します。
7. Sceneを1件ずつactivateし、Family Logの対象、detail、時刻、記録者を確認します。同じGoogle request IDの再送は `external_command_receipts` により二重記録されません。
8. 管理 → 外部連携 → Google Homeで最終SYNC、Scene総数、カテゴリ別preview、最終operationを確認します。request payloadやtokenは表示されません。
9. DISCONNECTではlink tokenだけが失効し、Family TODOのaccount/dataは残ります。必要なら再linkします。

SceneがSYNC後に無効化された場合、EXECUTEは `deviceNotFound` で安全に失敗し、勝手に記録しません。QUERYはSceneに架空stateを返さず、空のdevices応答です。

なおScene integrationには動的読み上げ機能はありません。


## 運用上の補足

Google Home専用のcredentialはGoogle Calendar用の `GOOGLE_CALENDAR_CLIENT_ID` とは別です。Test integrationは開発確認用でcertification/release対象外です。初回link後にcatalogを変更した場合はRequest Sync APIが未実装のため、再linkまたはGoogle側の再同期が必要になる場合があります。

Family TODOには架空device type/traitは追加しません。
SceneはReport State非対応です。

## Wave120: LINE Login callback (required)

Google Home account linking now uses the LINE Login OAuth v2.1 Authorization Code flow with PKCE, not LIFF. In **LINE Developers → the existing LINE Login channel → LINE Login settings → Callback URL**, add exactly:

`https://familytodo.marinski1112.workers.dev/oauth/line/google-home/callback`

Do not change the existing LIFF endpoint URL (`https://familytodo.marinski1112.workers.dev/liff`). No new LINE channel is required.

## Rich Menu LIFF deep links

**When a LIFF URL has additional query information, the slash after `{LIFF_ID}` is required.** Use `.../{LIFF_ID}/?next=...`, not `.../{LIFF_ID}?next=...`.

- `https://liff.line.me/{LIFF_ID}/?next=%2Fapp%2Ftasks.php`
- `https://liff.line.me/{LIFF_ID}/?next=%2Fapp%2Fcalendar.php`
- `https://liff.line.me/{LIFF_ID}/?next=%2Fapp%2Fshopping.php`
- `https://liff.line.me/{LIFF_ID}/?next=%2Fapp%2Ffamily_log.php`
- `https://liff.line.me/{LIFF_ID}/?next=%2Fapp%2Fmessages.php`
- `https://liff.line.me/{LIFF_ID}/?next=%2Fapp%2Fsettings.php`
