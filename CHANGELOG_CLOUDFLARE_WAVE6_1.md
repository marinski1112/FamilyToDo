# Family TODO LINE Cloudflare D1 Wave 6.1

## LIFF診断版

Wave 6 の `/liff` を診断強化しました。

- `liff.init()` 前後の状態を画面に表示
- LIFFエラーの `name` / `message` を表示
- `liff.isInClient()` / `liff.isLoggedIn()` を表示
- LIFF OS / SDK version を init 成功時のみ表示
- ID Token の「存在」のみ表示（トークン値は表示しない）
- `/app/api/liff_login.php` のHTTPステータスとJSONエラーを表示
- Secret、LINE User ID、ID Token本体などの秘密情報は表示しない
- 既存の認証、D1、定期タスク処理は変更しない

目的は、LINE Developers の LIFF Endpoint URL と `liff.init()` の不整合など、400の発生箇所を特定することです。
