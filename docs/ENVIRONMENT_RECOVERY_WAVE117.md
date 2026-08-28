# Wave117 環境変数復旧手順

値を新規生成せず、まず Cloudflare Dashboard の **Deployments** で Wave116 の正常 version を開き、当時の plaintext Variables を確認して同じ値を復元してください。Secret、token、鍵の値は本書やIssueへ貼らないでください。

## A. repo fixed vars

`wrangler.jsonc` が `APP_NAME`, `APP_URL`, `APP_TIMEZONE`, `NOTIFY_MODE`, `ENVIRONMENT`, `GOOGLE_HOME_CLIENT_ID=Family_ToDo`, `GOOGLE_HOME_PROJECT_ID=family-todo-home`, `FAMILY_AI_PROVIDER=GEMINI`, `GEMINI_MODEL=gemini-3.1-flash-lite`, `WORKERS_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast`, Calendar/Tasks callback URI を管理します。`keep_vars=true` により Dashboard-only Variables を次回 deploy でも保持します。

## B. Dashboard plaintext vars（履歴から復元）

`LINE_CHANNEL_ID`, `LINE_LIFF_ID`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_TASKS_CLIENT_ID` を監査してください。Tasks Client ID は Calendar fallback が可能です。`GOOGLE_HOME_REDIRECT_URI` は通常不要で、Project IDから本番/sandbox callbackを厳密生成します。値を推測しないでください。

今回消失候補は `GOOGLE_HOME_CLIENT_ID`, `GOOGLE_HOME_PROJECT_ID`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_TASKS_CLIENT_ID`, `GOOGLE_TASKS_REDIRECT_URI`, `GEMINI_MODEL`, `FAMILY_AI_PROVIDER`, `WORKERS_AI_MODEL`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` およびその他Dashboard plaintext Variablesです。

## C. Secrets（presenceだけ確認）

`APP_SECRET`, `LINE_CHANNEL_SECRET`, `LINE_ACCESS_TOKEN`, `NOTIFY_SECRET`, `VAPID_PRIVATE_KEY`, `GOOGLE_HOME_CLIENT_SECRET`, `GEMINI_API_KEY`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_TOKEN_KEY`, `GOOGLE_TASKS_CLIENT_SECRET`, `GOOGLE_TASKS_TOKEN_KEY` を Cloudflare Secrets で確認します。再生成は禁止です。Calendar Token Key変更は既存refresh tokenを復号不能にし、VAPID keypair変更は既存subscriptionを壊します。

## D. optional / fallback

Tasks は専用値から Calendar client ID/secret/token keyへfallbackし、redirect URIは既定callbackへfallbackします。Family AIの既定は Gemini 3.1 Flash-Lite、Workers AIの既定は Llama 3.1 8Bです。`/__cf/integrations-health` は値を出さずpresence/effective readinessだけ返します。診断表示はGoogle APIを呼びません。Calendarは4要素がすべてtrueになった後、既存アカウントがACTIVEであることを確認し「今すぐ同期」でoutbound/inboundのcredential errorがないことを確認します。

## Google Home 実機再テスト

1. 管理診断で実行中 `12.136.0-wave117`、Home configuredを確認する。
2. Google Homeアプリで Family TODO を選択し、LINEログイン、Family TODO consentを許可する。
3. sandbox callback、token exchange、SYNC完了後に「連携済み」と Scene countが1以上であることを確認する。
4. 失敗時は安全なstageログ（`AUTHORIZE_RECEIVED` から `SYNC_RECEIVED`）だけを確認し、state/code/token/cookieをログへ貼らない。
