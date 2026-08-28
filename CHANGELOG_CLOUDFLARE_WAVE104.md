# Cloudflare Wave104 — Gemini / Google Home実機接続

Version: `12.123.0-wave104`

- Gemini REST API keyをURL queryから `x-goog-api-key` headerへ移し、query/testをtimeout付き共通helperへ統合。
- Googleのsafeなstatus/code/reasonだけで接続失敗を分類し、response messageやsecretをUI・ログへ出さない。
- Google Home production/sandbox redirectをproject IDから限定導出し、専用credential・safe diagnostics・UTC operational timestampsへ対応。
- LINEログインのsame-origin relative `next`を維持し、OAuth stateを含むauthorize requestへ復帰。
- Google policy準拠の同意文言、Developer Console test手順、Scene-only非公開制約を文書化。
- migrationは追加せず、既存0034までを変更しない。
