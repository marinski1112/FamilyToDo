# 外部サービスの費用・プライバシー運用（Wave103）

確認日: **2026-08-28**。料金、quota、データ利用条件は変更されるため、デプロイ前と定期運用時に各公式ドキュメントを再確認してください。

## 無料運用の目安

| サービス | 2026-08時点の目安 | Family TODOのguardrail |
|---|---|---|
| Cloudflare Workers Free | 100,000 requests/day | cronは5分間隔を維持し、新しいpollや利用集計を追加しない。 |
| Cloudflare D1 Free | 5 million rows read/day、100,000 rows written/day、5 GB | outbox・期限到来通知・active Calendar accountだけをbounded queryする。 |
| Google Calendar API | standard usageは追加料金なし。billing threshold 1 million requests/day、10,000/min/project、600/min/user/project | OAuthで作成した `Family TODO` calendarだけをevents APIで同期する。sync tokenがあれば変更分だけ、HTTP 410のときだけfull resyncする。primary calendarとcalendarListを定期取得しない。 |
| Gemini API | `gemini-3.5-flash-lite` はFree Tierを利用可能。billingを明示的に有効化しない限りFree Tier。rate limit超過はHTTP 429。 | 1質問につきplanning requestは1回、D1 queryは最大3 step、結果をGeminiへ再送しない。大きな自然文を不要にするためoutputを512 tokensに制限する。 |

公式資料: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)、[Google Calendar API usage limits](https://developers.google.com/calendar/api/guides/quota)、[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)、[Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)。

## cron / API利用概算

5分cronは1日288回です。1 invocationでは通知の期限到来行を最大50件、Calendar outboxを既定最大10件、active Calendar accountを最大10件処理します。通常のCalendar accountあたり外部fetchはaccess token 1回と、専用calendarのincremental events page 1回（変更が250件を超える場合のみ追加page）です。outboxは処理対象1件あたりtoken取得とevent操作が各1回です。固定数の状態queryはありますが、全task、全Family Log、primary calendar、全calendar eventの定期full scanはしません。HTTP 410によるtoken失効時だけ専用calendarを再走査します。

## Geminiのデータ境界

Gemini Free TierではGoogleのpricing policy上、入力が製品改善に利用される可能性があります。Family TODOは名前をopaqueな `MEMBER_*` / `SUBJECT_*` にtokenizeし、raw D1 rows、Family Log値、集計結果、task/quick chore結果をGeminiへ送りません。Geminiへ送るのはtokenized question、function schema、家族timezone、現在日時、opaque refsだけで、D1集計と最終回答はWorker内で行います。Googleの現行pricing表ではPaid Tierの入力・出力はproduct improvementに利用されない扱いです。

## model lifecycle

実行modelは `GEMINI_MODEL` 環境変数を最優先し、未設定時だけコード内の `GEMINI_MODEL_DEFAULT` を使います。管理者は「管理 → 外部連携 → Family AI」でmodel IDとoverride状態を確認できます。API keyは画面、response body、console/activity logへ出しません。model廃止時はCloudflareの `GEMINI_MODEL` を現行modelへ切り替えてから接続確認してください。
