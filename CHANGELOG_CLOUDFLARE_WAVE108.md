# Wave108 — ICS / TimeTreeカレンダーの安全なインポート

Version: `12.127.0-wave108`

## 実装

- OWNER / ADMIN専用の「管理 → カレンダーインポート」を追加。選択直後には保存せず、2 MiB / 5,000 VEVENT制限、先頭20件、警告、重複分類を含むpreviewを必須にした。
- Worker内のRFC 5545 subset parserがCRLF/LF、folding、VCALENDAR / VTIMEZONE / VEVENT、ネストしたVALARM、TEXT escape、TimeTreeの主要propertyを処理する。VALARMは件数だけ表示し通知には変換しない。
- `TZID`はIANA timezoneとして解釈し、UTC `Z`はfamily timezoneへ変換、floatingはfamily wall-clockとして保存する。VTIMEZONEのCOMMENT有効範囲には依存しない。
- DATEのDTEND exclusiveをFamily TODOのinclusiveな23:59:59へ変換する。SUMMARY内の時刻は日時決定に利用しない。
- WEEKLY / INTERVAL_WEEKS / MONTHLY_DAY / YEARLY、UNTIL、EXDATEを既存のtask + recurrence rule + excluded occurrenceへ保存する。RELATED-TOは独立予定のsource metadataだけに保持する。RECURRENCE-IDは安全な単発予定として警告する。
- UID + normalized RECURRENCE-IDでfamily内identityを固定し、同一再importは新規0、source変更は自動上書きしない。50件chunkでD1へ先に保存し、Google APIを直接呼ばない。
- batch rollbackはimport時の`updated_at` snapshotと比較し、手編集済みtask/ruleを保持する。raw ICSはD1にもrepositoryにも保存しない。
- YEARLYを管理UI、validation、matcher、分割/編集経路へ正式追加した。任意のimport色はtask/recurrence編集selectへ一時optionとして残す。
- 既存の期限切れqueryは`task_kind=TASK`だけを対象にしており、過去EVENTをpendingのまま履歴・カレンダーへ保持しても期限切れタスクに混入しないことをsmokeで固定した。

## 実機インポート手順

1. migration `0036_wave108_calendar_ics_import.sql`を適用してWorkerをdeployする。
2. OWNERまたはADMINで「管理 → カレンダーインポート」を開く。
3. TimeTree Exporterの`.ics`を選択し、通常は既定の「全期間」のまま「内容を確認」を押す。
4. 予定/終日/時刻あり/定期/除外日/期間、アラーム非取込、エラー、重複分類を確認する。実ファイルの期待値は634 / 479 / 155 / 7 / EXDATE-bearing 2 / RELATED-TO 1 / RECURRENCE-ID 0。
5. 「インポート」を押し、完了表示まで画面を閉じない。50件ずつD1へ取り込み、Google Calendarへの投影は行わない。
6. カレンダーで過去と今後の予定、終日exclusive end、時刻、色、定期除外日をspot checkする。必要な非定期・今後EVENTのGoogle同期は既存outbox方針に従って別途行う。
7. 取り消す場合は履歴の「取り消す」でpreviewし、「編集済みのため保持」を確認してから確定する。
