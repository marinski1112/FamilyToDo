# 購入分ごとの在庫と料理完了

「ごはん→在庫」で購入分ごとの材料名、残量、単位、購入日、期限、常温/冷蔵/冷凍を登録・調整・一覧から除外できます。管理方法はEXACT（正確な数量）、APPROXIMATE（おおよそ）、PRESENCE（ある/なし）、UNTRACKED（追跡しない）。登録中は家族最大200件。期限順に表示し、同じ操作の再送は重複登録せず、除外後の遅れた再送でも復活しません。

## 買い物と料理

確定献立の買い物確認は、同じ献立revisionでまだ作っていない日の必要量を計算。材料名が完全一致し、単位が同じかkg/g・L/ml/mLで換算でき、購入日を迎え、期限が経過していないEXACT在庫だけ差し引きます。近似量/有無、別単位、未登録在庫、既存買い物の購入済み分は自動差し引きしません。kg/g・L/ml/mLだけ確定係数で換算し、名前のAI正規化やパック→g換算は行わず、表示した不足分を利用者が選んで既存買い物へ追加します。献立/在庫が変わった古いpreviewは拒否します。買い物正本は元DBで、専用DBへコピーしません。2DBを跨ぐtransactionはなく、検証済みsnapshotを元DBの既存冪等projectionへ渡す構造です。

Cookingの「作った！」は確認画面を開き、使用量と実際に減らす購入分を表示します。EXACTのみ期限の近い順、同一期限なら購入日/ID順で消費。チェックを外せば完了記録のみです。不足分はマイナス在庫にしません。1回に自動消費する購入分は最大16件、残りは在庫画面で調整可能。D1無料の1Worker50queries制限（https://developers.cloudflare.com/d1/platform/limits/）に既存認証の余裕を残します。

## 整合性と履歴

0005にinventory_lots、inventory_events、meal_inventory_state、meal_inventory_operationsを追加。数量は1/10000単位の整数で保存・計算。家族別revisionとlot一覧は単一SQL snapshotで読むため、途中の在庫編集で混在しません。lot追加/調整/除外と操作claim、revision trigger、調整前後の監査JSONはD1 batchで原子的に保存。楽観revisionで古い調整を拒否します。

Cooking完了claim、在庫減算、CONSUMEイベントも同じMEALS_DB batch。献立revisionと、消費を行う場合の在庫revisionをtransaction内で比較して古い承認を拒否。完了記録の自然キー（family/date/plan revision）とoperation tokenで、並行実行・応答喪失からの再送でも二重消費しません。以前の「記録だけ」の完了を後から消費に変換しません。AI呼出し/新Cronなし。履歴は当面保持。人・買い物マスタを複製しません。

## 検証

献立33件のSQLite/API/DOM、型チェック、JS構文、静的参照、既存active regression143件成功。家族分離、CSRF、楽観更新、数量検証、再送/除外後再送、監査失敗時の全rollback、正確な量/期限/単位の条件、古いpreview、FEFO消費、並行Cooking、消費opt-out、200件/16件の上限、確認前の未変更を検証。Chromiumで登録→買い物差し引き→料理確認→完了→残量の操作、管理方法の表示切替、320/390/768pxのoverflowなしを確認（syntheticデータのみ）。レシート・AI別名・安全在庫・離乳食数量は後続の独立拡張です。

単位換算の表示・整数tick精度・保存済み買い物と再送の扱いは[unit-conversion.md](unit-conversion.md)を参照。
