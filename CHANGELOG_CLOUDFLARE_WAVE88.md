# Wave88 — Family Log標準インポート

Version: `12.107.0-wave88`

## 実装

- 正本形式 `familytodo-family-log-import-v1` を定義し、外部JSONの `family_id`、`subject_id`、`created_by`、`member_id`、`task_id` は使用しない。
- OWNER / ADMINがFamily TODO内の対象を選び、JSONを解析、プレビューした後にだけ確定する。PDF parser、PDF.js、OCR、AI APIは追加しない。
- batch provenance、ファイル/record hash、active recordの部分一意indexにより履歴・冪等性を保つ。soft delete後は同じrecordを再取込可能。
- rollbackはbatch作成ログだけをsoft deleteする。`updated_at != created_at` の編集済みログは安全のため保持し、二重rollbackはno-opにする。
- `UNSUPPORTED` と未知typeはMEMOへ変換せずプレビューエラーにする。日時、有限数、単位、時間、最大長をサーバー検証する。

## 標準JSON

```json
{
  "format": "familytodo-family-log-import-v1",
  "source": "piyolog",
  "source_exported_at": "2026-03-05T00:00:00+09:00",
  "records": [{
    "external_id": null,
    "occurred_at": "2026-03-04T02:05:00+09:00",
    "log_type": "MILK",
    "detail_code": null,
    "amount": 60,
    "unit": "ml",
    "duration_minutes": null,
    "value_text": null,
    "note": null,
    "source_text": "ミルク 60ml",
    "source_page": 1,
    "source_hash": null
  }]
}
```

## Wave89候補

- **VACCINE**: 予防接種は投薬行為のMEDICINEとも自由記録のMEMOとも意味が異なる。ワクチン名、回次、接種日を扱う専用typeを検討する。
- **離乳食食材管理**: Wave88は日々の内容をMEALの`value_text`/`note`へ保持する。食材マスター、初回日、アレルギー履歴は別domainとして検討する。
- **charts**: import後の身長・体重・体温・睡眠を対象別に可視化する。sourceによらず正規化済みログを入力にする。
