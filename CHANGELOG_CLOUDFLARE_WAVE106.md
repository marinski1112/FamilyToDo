# Cloudflare Wave106 — 12.125.0-wave106

## Family AI
- Gemini model availability now uses `models.list` with the `x-goog-api-key` header and consumes no inference request. The selected-model connection test remains exactly one synthetic inference.
- Quota diagnostics safely retain at most eight structured violations and classify zero allocation, RPD, RPM, TPM, retry-only, and unknown cases without retaining upstream messages.
- Added an explicitly selected `WORKERS_AI` provider through the `AI` binding, with an overrideable non-secret model ID and no Gemini-to-Workers automatic fallback.
- Both provider adapters produce the same typed plan, which is passed through the existing allowlist, SQL rejection, query validator, and D1 executor. Only tokenized questions, time context, schemas, and opaque refs leave the Worker.
- Exact 「今日の予定」 and 「明日の予定」 queries use a deterministic local plan and consume no AI quota.
- Family AI queries and UI are restricted to OWNER and ADMIN. Provider selection remains deployment configuration, so no migration is added.

## Operations
Set `FAMILY_AI_PROVIDER` to `GEMINI` (default) or `WORKERS_AI`. For Gemini set `GEMINI_API_KEY`; for Workers AI deploy the included `AI` binding and optionally set `WORKERS_AI_MODEL`. Never configure automatic provider fallback.
