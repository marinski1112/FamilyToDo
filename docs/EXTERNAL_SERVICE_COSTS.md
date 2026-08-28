# 外部サービスの費用・プライバシー運用（Wave106）

確認日: **2026-08-28**。料金、quota、データ利用条件は変更されるため、デプロイ前と定期運用時に各公式ドキュメントを再確認してください。

## 無料運用の目安

| サービス | 2026-08時点の目安 | Family TODOのguardrail |
|---|---|---|
| Cloudflare Workers Free | 100,000 requests/day | cronは5分間隔を維持し、新しいpollや利用集計を追加しない。 |
| Cloudflare D1 Free | 5 million rows read/day、100,000 rows written/day、5 GB | outbox・期限到来通知・active Calendar accountだけをbounded queryする。 |
| Google Calendar API | standard usageは追加料金なし。billing threshold 1 million requests/day、10,000/min/project、600/min/user/project | OAuthで作成した `Family TODO` calendarだけをevents APIで同期する。sync tokenがあれば変更分だけ、HTTP 410のときだけfull resyncする。primary calendarとcalendarListを定期取得しない。 |
| Gemini API | quotaはProject単位で、Free Tier可否・上限はProject条件とmodel catalogに依存する。既定modelは `gemini-3.1-flash-lite`。 | catalog確認はinferenceを消費しない。1質問または接続確認につきplanning requestは最大1回。結果はGeminiへ再送しない。 |
| Cloudflare Workers AI | Free planは10,000 Neurons/day。上限後はFree planではrequestが失敗する。 | `AI` bindingだけを使用し、新しいAPI secret・billing API・自動Paid upgradeを持たない。 |

公式資料（料金は変更され得るため運用時に再確認）: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)、[Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)、[Google Calendar API usage limits](https://developers.google.com/calendar/api/guides/quota)、[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)、[Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)。

## cron / API利用概算

5分cronは1日288回です。1 invocationでは通知の期限到来行を最大50件、Calendar outboxを既定最大10件、active Calendar accountを最大10件処理します。通常のCalendar accountあたり外部fetchはaccess token 1回と、専用calendarのincremental events page 1回（変更が250件を超える場合のみ追加page）です。outboxは処理対象1件あたりtoken取得とevent操作が各1回です。固定数の状態queryはありますが、全task、全Family Log、primary calendar、全calendar eventの定期full scanはしません。HTTP 410によるtoken失効時だけ専用calendarを再走査します。

## AI providerのデータ境界

Gemini Free TierではGoogleのpricing policy上、入力が製品改善に利用される可能性があります。Family TODOは名前をopaqueな `MEMBER_*` / `SUBJECT_*` にtokenizeし、raw D1 rows、Family Log値、集計結果、task/quick chore結果をGeminiへ送りません。Gemini / Workers AIへ送るのはtokenized question、typed function schema、家族timezone、現在日時、opaque refsだけで、D1集計と最終回答はWorker内で行います。Googleの現行pricing表ではPaid Tierの入力・出力はproduct improvementに利用されない扱いです。

## model lifecycle / provider selection

`FAMILY_AI_PROVIDER` は `GEMINI`（default）または `WORKERS_AI` を明示指定します。429を理由に送信先を自動変更しません。Gemini model catalogは `models.list` からProjectに見えるmodelだけを表示し、`gemini-2.5-flash-lite` をfallbackとは仮定しません。`GEMINI_MODEL` / `WORKERS_AI_MODEL` はmodel IDだけのoverrideで、secretではありません。

## billing / quota guardrail（Wave106）

Family TODOは課金関連API（billing API）を呼ばず、Paid Tier移行やWorkers Paidへのupgradeを行いません。Gemini 429はGoogle AI Studioの Rate LimitsでProject quotaを確認してください。model一覧はinference quotaを消費せず、接続確認だけが選択modelへ固定synthetic inferenceを1回送ります。Workers AI Free allocation超過時は一時利用不可として失敗し、別providerへfallbackしません。
