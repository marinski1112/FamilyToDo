# ぴよログ import design (Wave88 candidate)

Wave87では実 export sample がないため parser を実装しない。sample 提供後に grammar を確定する。

## Flow
1. `.txt` upload または text paste。
2. BABY 対象を明示選択（`subject_id` と記録者 `created_by` を混同しない）。
3. parse preview で日時、変換先、未対応行、重複候補を表示。
4. batch ID を付与して確定し、batch 単位で rollback 可能にする。

## Mapping candidates
MILK, BREASTFEED, DIAPER, SLEEP, BATH, TEMPERATURE, MEDICINE, HEIGHT, WEIGHT, MEMO。実 sample で表記、日跨ぎ、単位、複数行 memo を確認してから確定する。

## Safety
原文 hash、対象、日時、type、値を使う冪等 key で duplicate を防ぐ。未対応行は捨てず preview に原文と理由を表示する。既存ログは更新・削除しない。
