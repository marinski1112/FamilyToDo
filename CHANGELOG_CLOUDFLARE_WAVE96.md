# Cloudflare Wave96 — 12.115.0-wave96

- Google Home Cloud-to-cloud Scene fulfillment (`SYNC`, `EXECUTE`, safe `QUERY`, `DISCONNECT`)を追加。
- LINE sessionで本人同意するOAuth 2.0 Authorization Code / refresh token flowを追加。code/tokenはSHA-256 hashのみ保存し、redirect URIを完全一致検証。
- BABY/CHILD sleepとactive quick choreの既存domain処理をUI/Googleで共有し、family境界を強制。
- Google `requestId` + command key receiptによる重複mutation防止を追加。
- Google Home外部連携画面、秘密値を含まないhealth、schema/runtime health、migration/smokeを追加。
- Script Editorの実用例と、Webhook/dynamic readback非対応を文書化。
