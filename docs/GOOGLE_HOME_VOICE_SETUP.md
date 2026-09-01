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

子どもの睡眠・排泄・成長日記Sceneはactiveな **BABY / CHILD**を対象にします。PETは専用のペットScene、ちょこっと家事は家族共通Sceneとして別に公開します。ADULT / OTHERは子ども向けSceneの対象外です。activeなBABY / CHILDが家族内で1人なら表示名から名前を省略し、2人以上なら必ず名前を付けます。IDにはどちらの場合もsubject IDを保持します。

* 睡眠: `寝た` / `起きた`（複数なら `ゆうま寝た` / `ゆうま起きた`）
* BABY排泄: `DIAPER` + `WET` / `DIRTY`
* CHILD排泄: `TOILET` + `WET` / `DIRTY`
* 現在: `ft:log:wet:<subject_id>:now` / `ft:log:dirty:<subject_id>:now`
* 1時間前: `ft:log:wet:<subject_id>:m60` / `ft:log:dirty:<subject_id>:m60`
* 成長日記: `ft:journal:stand:<subject_id>` / `ft:journal:first_step:<subject_id>` / `ft:journal:first_tooth:<subject_id>` / `ft:journal:tooth:<subject_id>`（立った・歩いた・最初の歯・歯）
* ちょこっと家事: 従来どおり `ft:chore:<id>`

`enabled_types_json` でBABYのDIAPERまたはCHILDのTOILETが無効なら排泄SceneをSYNCせず、EXECUTE時にも再検証します。名前とnicknameはUnicode code pointで60文字以内です。自然な補助名は「おしっこを記録」「排尿記録」「睡眠開始」「起床記録」など少数に限定し、名前には「OK Google」「Hey Google」「Google」を含めません。

## Cloud-to-cloud Sceneの制約

Cloud-to-cloud Sceneの `action.devices.commands.ActivateScene` がfulfillmentへ渡す動的parameterはactivate/deactivateだけです。自由な音声文をFamily TODOへそのまま転送できません。 成長日記も4つの固定マイルストーンだけをScene化し、身長・体重の数値や自由メモはGoogle Home Sceneから受け取りません。「1時間前」はWave114では固定のpreset Sceneであり、nowとminus 60分だけをallowlistします。30分、37分、昨日、具体時刻、量（140ml）などの任意値は解析しません。任意時刻・量にはFamily AIを利用できる別入力チャネルが必要です。Google Home向けの非公式NLU webhook（`home.execution.Webhook`）は作りません。

Script Editorの `assistant.event.OkGoogle` は`device.command.ActivateScene` で固定queryからpreset Sceneを起動する補助には使えますが、queryから可変時間をcaptureしてActivateSceneへ渡せるとは仮定しません。Wave114ではScript Editorは必須ではありません。

## 初回Account Linking（Wave114 deploy後）

1. Wave114をdeployし、上記Console設定とCloudflare secretsを再確認します。
2. Developer Consoleでtest userを登録し、**Test integration** を開始します。
3. Google Homeアプリで「デバイス」→「追加」→「Works with Google Home」を開き、`Family TODO` を選びます。
4. Family TODOのLINEログインを完了し、連携画面で、Googleからの記録者になるmemberを確認して「連携する」を押します。共有スピーカーのvoice identityではなく、このlinked memberが `created_by` になります。
5. Googleの初回SYNC完了後、Home appまたはHome Graph/Test SuiteでScene一覧と件数を確認します。初回link前にWave114 catalogをdeployするため、Request Sync APIは不要です。
6. 対象が1人なら「寝た」「おしっこ記録」「1時間前のうんち記録」に加えて「立った記録」「歩いた記録」「最初の歯記録」「歯記録」があり、複数なら名前付きSceneになることを確認します。PETや無効typeの扱いも確認します。
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

## Wave121: LINE Login Web OAuth credentials

Google Home account linking uses a **LINE Login channel**, independently from the Messaging API channel.
In LINE Developers, open **LINE Login channel → Basic settings** and configure:

- Channel ID → Worker text variable `LINE_LOGIN_CHANNEL_ID`
- Channel secret → Cloudflare Secret `LINE_LOGIN_CHANNEL_SECRET`
- Callback URL → `https://familytodo.marinski1112.workers.dev/oauth/line/google-home/callback`

**Never put the Messaging API channel secret (`LINE_CHANNEL_SECRET`) in `LINE_LOGIN_CHANNEL_SECRET`.**
`LINE_CHANNEL_SECRET` remains dedicated to webhook signature verification and `LINE_ACCESS_TOKEN` remains dedicated to Messaging API delivery. `LINE_LOGIN_CHANNEL_ID` falls back temporarily to `LINE_CHANNEL_ID`, but the Login secret never falls back.

### Recommended Rich Menu URLs

Use LIFF additional paths for stable destinations:

- `https://liff.line.me/{LIFF_ID}/tasks`
- `https://liff.line.me/{LIFF_ID}/calendar`
- `https://liff.line.me/{LIFF_ID}/shopping`
- `https://liff.line.me/{LIFF_ID}/family-log`
- `https://liff.line.me/{LIFF_ID}/messages`
- `https://liff.line.me/{LIFF_ID}/settings`

The legacy `?next=` URLs above remain supported.

## Wave122 acceptance and Console alignment

Family TODO fulfillment currently returns `action.devices.types.SCENE` with `action.devices.traits.Scene`. The Google Home Developer Console Device type must therefore be **SCENE** as well; remove configuration-only physical types that fulfillment does not return. Family TODO cannot change the Console setting automatically.

A device tile in the Home app is not the acceptance criterion. Final acceptance is one successful end-to-end path: voice command → `action.devices.commands.ActivateScene` EXECUTE → Family TODO record → SUCCESS execution diagnostic with the linked recorder member. The settings page derives authentication, last successful SYNC/count, and last successful EXECUTE from existing local records without a Google API call. Request Sync/service-account infrastructure is intentionally not added while initial account-linking SYNC works.

## Wave124: Home Graph Request Sync

1. Google Cloud Consoleで **HomeGraph API** を有効にします。
2. Service Accountを作成し、JSON keyを発行します。
3. JSON全文をCloudflare Worker Secret **`GOOGLE_HOME_SERVICE_ACCOUNT_JSON`** に設定します。
4. 管理 → Google Homeの「Google Homeへ操作一覧を再同期」で確認します。

JSON credential、private key、access token、JWTをGitHubや通常の環境変数へ置かないでください。画面にはSecretの有無だけを表示します。Secretが未設定でもAccount Linking、OAuth、SYNC、EXECUTEは従来どおり動き、Request Syncだけが `NOT_CONFIGURED` になります。
