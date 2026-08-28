# Cloudflare Wave103 — Calendar / Family AI production hardening

Version: `12.122.0-wave103`

- Gemini runtime defaultを提供終了済みmodelから `gemini-3.5-flash-lite` へ更新し、`GEMINI_MODEL` overrideを維持。
- 接続確認をHTTP status由来のsafe categoryに限定。upstream body、API key、実ユーザーデータを返却・記録しない。
- invalid function planには再表現を促す安全なメッセージを返し、planningは1 fetch・最大3 query・Worker回答生成を維持。
- 外部連携画面に現在model、Calendar inboundの「予定」作成先、Google「タスク」対象外、safe sync countersを表示。
- 専用calendar、incremental sync token、outbox、active accountsという無料運用guardrailを維持。migrationは追加せず、既存0034までを変更しない。
- 費用・quota・Gemini Free Tier privacy方針を `docs/EXTERNAL_SERVICE_COSTS.md` に記録。
