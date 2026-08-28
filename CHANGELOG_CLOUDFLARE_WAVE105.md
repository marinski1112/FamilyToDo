# Cloudflare Wave105 — Family AI Free運用安定化

## Family AI
- Geminiの既定modelを `gemini-3.1-flash-lite` に変更し、`GEMINI_MODEL` overrideを維持しました。
- HTTP 429をQuotaFailureの安全なmachine-readable fieldsだけでRPM / TPM / RPD / quota zero / temporary / unknownへ分類します。upstreamの `error.message`、質問、payload、API keyは診断へ出しません。
- 実質問も接続確認と同じ分類を使い、429は安全な本文とHTTP 429で終了します。Geminiは1回だけで、失敗後にD1 query・mutation・retry・model切替を行いません。
- 管理者が明示的に押した場合だけ、Free候補3modelへ各1回のsynthetic probeを行います。probeは実family dataを使わず、自動切替もしません。

## 回帰保護
- Google Calendarの専用calendar、outbound/backfill、incremental syncToken、TASK保持、新規EVENT、削除hide、PRIVATE除外、5分cronをsmokeで維持します。
- Google Homeのproduction/sandbox redirect、LINE continuation、Scene SYNC/ActivateScene、receipt idempotencyを維持します。架空deviceは追加していません。

## schema
migrationはありません。
