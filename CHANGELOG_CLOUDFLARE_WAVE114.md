# Cloudflare Wave114 — Google Home Family Log Scenes

Version: `12.133.0-wave114`

- activeなBABY/CHILDに、睡眠2件、排泄now 2件、排泄minus-60 preset 2件の最大6 Sceneを公開するcatalogへ拡張。
- 1人時は対象名を表示名だけから省略し、複数時は名前を必須化。stable IDは常にsubject IDを保持。
- BABYはDIAPER、CHILDはTOILETのWET/DIRTYとして、family timezoneの現在または60分前をdomain helperから記録。
- enabled type、active、family、kind、detail、preset、linked memberをEXECUTE時に再検証し、既存receiptで再送を冪等化。
- primary/nicknameをUnicode code point 60文字に制限し、自然な少数aliasと安全な診断categoryを追加。
- 管理previewを睡眠・排泄・ちょこっと家事でグループ化し、総Scene数を表示。
- Cloud-to-cloud Sceneには自由発話parameterがないこと、Developer Consoleで架空device typeを使わないこと、初回link手順を文書化。
- migrationなし。既存の `family_logs` と `external_command_receipts` を利用。
