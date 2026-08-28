# Cloudflare Wave124 — 12.143.0-wave124

## 変更
- ちょこっと家事は360px以上で4列を維持し、8文字までを省略せず2行表示する canonical CSS に統合しました。既存の長い名称は移行・切断しません。
- Family Log QUICKの変更後と管理画面から、HomeGraph Request Syncを要求できます。Worker Secret `GOOGLE_HOME_SERVICE_ACCOUNT_JSON` は任意で、未設定でも既存OAuth/SYNC/EXECUTEは継続します。
- Google Tasks voice inboxにミルク任意量、排泄、離乳食、風呂、嘔吐、体温、24時間以内の相対時刻、対象名と安全な省略規則を追加しました。
- deterministic parserを先に実行します。Gemini fallbackは未接続（既定OFF）のfoundation方針です。

## 境界
予定はGoogle Calendar、数値Family Log・買い物・simple taskはGoogle Tasks、parameter-free操作はScene、Family TODO固有の照会はFamily AIが正本です。新規migrationはありません。
