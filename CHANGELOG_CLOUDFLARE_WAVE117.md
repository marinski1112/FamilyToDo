# Cloudflare Wave117 — 12.136.0-wave117

- `keep_vars` と既知の非secret integration varsを固定し、Dashboard plaintext消失事故を防止。
- 全integrationのpresence/effective readinessをraw値なしで監査。
- Google Home OAuthの10分AES-GCM continuationをcanonical Worker/LIFFへ統合し、応急entrypointを廃止。
- DB migrationなし。既存暗号化token・VAPID・LIFF credentialを変更しない。
