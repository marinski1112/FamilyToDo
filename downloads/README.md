# Android テスト版

## 最新版 v0.1.187

**[APKを直接ダウンロード](https://raw.githubusercontent.com/marinski1112/FamilyToDo/android-test-downloads/downloads/FamilyToDo-test-v0.1.187.apk)**

### 今回の反映

- カレンダーの時刻付きタイトルで同じ時刻が二重表示されないようにする。全角入力もWebと同じNFKC規則で処理し、終日・複数日帯の元タイトルは保持。
- 単日予定はWebと同じsort_order、idの順に表示。子タスクがある場合、件数は子を数えて親を重複計上しない。
- 完了済み買い物・持ち物はWebのJST 0時／1時猶予に合わせて表示。カレンダーの日付付き履歴は保持。画面を開いたままの境界と再開時にも表示期間を確認。
- 日移動・月スワイプが既存overview APIの2000〜2100年範囲を超えないようにする。
- 予定が4件・複数日帯がある日のスタンプ用余白を広げ、タスク件数への重なりを解消。
- 連続追加した項目がカテゴリ名変更後も保持されることを再確認。完了済み絞り込みは元の一覧を切り離さず表示時に判定。
- v0.1.184までの日付指定・年月指定・カレンダーフィルタ、両goodsリスト表示、一括検索・空カテゴリ、伝言の最新初期位置／履歴位置保持・リアクションと以前のUI変更も含む。

### APIの反映条件

必要な取得列（sort_order、parent_task_id、完了日時）・最近の日付なし完了済みgoods・認可された日付なし子の最小メタデータは別のドラフト[PR #1147](https://github.com/marinski1112/FamilyToDo/pull/1147)。本番未反映です。**APKだけでは予定順序・子件数・日付なし完了の取得差分は解消しません。** 旧APIではid順・従来の件数／取得結果へ互換動作します。Webイベント編集入口[PR #1146](https://github.com/marinski1112/FamilyToDo/pull/1146)も別ドラフトで未反映。

### 検証

[Android CI 187](https://github.com/marinski1112/FamilyToDo/actions/runs/36960974783)：通常・Preview・隔離E2E・ReleaseビルドとAndroid 11/API30・15/API35、360dp、ライト／ダークの画面・操作テスト成功。
[通常 CI](https://github.com/marinski1112/FamilyToDo/actions/runs/36960974772)成功。

架空のfixtureで時刻整形・予定順序・子件数・完了時刻の境界／offset／undo／旧API互換・表示件数・元一覧保持・日付上限・スタンプと件数の非重複を検証。既存の連続追加・カテゴリ編集／失敗復旧・スワイプ・伝言位置なども通過。画面画像の重なりも確認しました。本番データへの書き込みなし。

APIは実SQLiteによる認証・家族／PRIVATE境界、0時／1時、履歴保持、親子取得、500件上限、既存複合indexの両列検索を検証。[API CI](https://github.com/marinski1112/FamilyToDo/actions/runs/36961150281)成功。

AndroidソースSHA：`6d68e007136bd07a4b244ae62f5242b444053be2`。
APIソースSHA：`aa65e548a74aa1738ae58f231c7875318bba8195`。
APK SHA256：`720b5a1ff57ad01edb32591f8952858be934a0d2856cae432b486eff5cdb9fa5`（263209 bytes）。
署名証明書SHA256：`0d514d2024caed4ecabd53c32c3c507e1a1284d7ba95b408ec22d79f7c452bcb`。

### 到達点とインストール

主要な日常画面はまとめて実機で試す段階です。常用版としての完成判定にはAPI反映と実機のLINEログイン・同期・日本語IME・写真・権限・位置共有の確認が残ります。地図・履歴、日誌詳細、食材、一部管理は認証済みアプリ内Web画面。育児集計の最新体温／体重／身長・推移、水分／運動／散歩、Webの最大3年期間と残る設定は未移植です。

v0.1.184などとは署名が異なり上書き更新できません。入れ替える際は未送信下書きを保存し、位置共有を停止して旧アプリを削除・再インストールするため、再ログインと端末設定の復元が必要です。Webに保存済みの家族データは残ります。固定署名の内部配布用GitHub Secretsは未設定。途中版の入れ直しは不要で、API反映後などにまとめて確認できます。

[Android PR #1143](https://github.com/marinski1112/FamilyToDo/pull/1143)
