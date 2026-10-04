# ごはんWeb MVP

Webから開始し、AndroidはAPI安定後に追加する。家族の認証は既存セッション、family/memberマスタは既存DBのみ。専用MEALS_DB未設定またはMEALS_ENABLED未有効の間、従来ホームと6タブを維持。準備後はindexがごはんになり、従来dashboardは/app/home.phpに残る。

## 初期機能

- /app/meals.php 今日・今週の献立・レシピ・食べたいもの。
- 家族共有レシピ（料理名、人数、時間、材料の数値と単位、手順、出典URL）、編集・アーカイブ。
- 週間献立は月〜日、平日5品を基本に1〜7日。下書き・確定、人数変更。保存時のレシピをsnapshotとして保持するため後日のレシピ編集で確定献立は変わらない。
- 必要食材は通常コードで人数換算し、同じ名前・単位だけ加算。異なる単位の換算や曖昧な同義語推測は行わない。確認画面で在庫にある材料を外して、既存shopping_itemsへ共有項目として追加する。
- 同一週の追加は一度。既存DBのprojection claimとshopping_itemsを同じD1 batchで作成し、並行実行・通信再送でも二重追加しない。利用者が買い物を削除した後も再送で復活させない。確定後に献立を編集した場合の追加差分は自動投入せず既存買い物で調整する。
- 調理中は大きな手順、前へ/次へ、材料・人数換算、作った記録。音声Liveや自動在庫消費はまだ提供しない。
- AIへの呼び出し・新規cron・Google Calendarへの書込み・LINE外部設定の変更なし。

## APIと保存形式

GET /api/meals/v1?week=YYYY-MM-DD、view=recipe&id=...、view=shopping_preview。
POST /api/meals/v1 はcsrf必須。action=save_recipe/archive_recipe/wishlist_add/wishlist_delete/save_plan/shopping_confirm/cooked。family_id/member_idはtrusted contextからのみ解決。外部から指定しても無視。全family read/writeはfamily predicate付き。共有ドメインのため家族の全active memberが操作できる。

レシピ材料/手順と献立snapshotを初期MVPでは検証済みJSON aggregateとして保存。ingredients/aliases/lots/receipt等の正規化テーブルは在庫導入時に追加する。MEALS_DBに買い物表やidentityマスタは作らない。既存DBのmeal_shopping_projectionsは週/hash/operation/creator/日時だけの調整メタデータ。

レシピ/献立はrevision比較で古い編集を拒否し、同じpayloadの再送を許可。wishlist・cookedもid/日付/plan revisionで冪等。API/HTMLはprivate no-store。service workerはAPI/HTMLをキャッシュせず既存static-only方針を維持。初期一覧は最大200レシピ・200wishlist、献立1週7日まで。レシピ一覧はsummaryだけを読み、大きな手順を一覧ごとには取得しない。

## 明日の所有者作業

Cloudflareで新しいD1データベース familytodo-meals を作成し、database_idを確認する（既存familytodo DBを選ばない）。作成後のIDを共有すれば、こちらでwrangler.jsoncにMEALS_DB bindingとmigrations_dir ./meals-migrationsを追加するPRを準備できる。

CLIを使う場合の作成コマンド: npx wrangler d1 create familytodo-meals

本番接続には、実IDを持つ追加binding、MEALS_ENABLED=true、既存DBの0116 migration、MEALS_DBの0001 migrationが必要。AiBudget PRを先行反映する場合は既存DBの0115も先に適用する。ID未取得の現段階で偽IDを本番configへ追加しない。

準備できた後の適用コマンドは npx wrangler d1 migrations apply DB --remote と npx wrangler d1 migrations apply MEALS_DB --remote。適用対象を確認した上で、CI・preview・self reviewを経てWorkerを反映する。現在は本番migration/deploy未実行。

## 後続実装

LINE Inbox、URL/動画レシピ抽出、AI献立、在庫lot/レシート照合/在庫消費、離乳食ルール、Cooking Live（ephemeral token/session制限）、AndroidとGoogle Home。モデルrouteの再配分は品質/出力schemaの検証後にfeature単位で行う。D1接続後にWeb実環境の認証/共有/保存/買い物E2Eを確認してからAndroidへ進む。

## 検証

8件のSQLite + 実APIテスト: tenant分離、CSRF、feature停止、入力検証、レシピの楽観更新と再送、人数計算と単位分離、確定snapshot、tamper/stale preview拒否、並行shoppingと削除後再送、cooked冪等、6tab/CSRF cookie、日曜から月曜にまたがる明日の献立。型チェック、JS構文、static assets、既存migration smoke、143件のactive regression成功。実データ/AI quotaを使用していない。

ローカルChromiumでsyntheticデータの画面・操作を確認: レシピ保存失敗時の入力保持と再試行、平日5品の確定、在庫食材の選択除外、wishlist追加、Cooking前後と完了の無効ボタン、320/390/768pxとライト/ダーク、水平overflowなし・6タブ維持。Google/LINE/本番D1への通信はなし。
