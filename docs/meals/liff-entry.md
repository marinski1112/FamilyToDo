# 献立のLINE入口

既存の1つのLINE_LIFF_IDを使い、献立画面の「LINEでこの画面を開く」からLIFFへ移動する。追加のLIFF登録やリッチメニュー変更は不要。nextに画面・料理日・週・レシピIDを保持し、既存のvalidateLiffNext/resolveLiffDestinationで検証する。未ログインの献立ページもクエリを保持して既存LINE認証に移動する。ログイン後の家族・権限は既存セッションとAPIで再検証する。リンクのIDや日付は認証には使わない。

設定がない場合はLINEボタンを表示しない。外部LINEコンソールや本番ログインは未操作。合成データで遷移先保持を確認し、実LINE内での復帰・画面表示はユーザーのログイン後に確認する。

## LINE側の設定（2026-10-06）

新しいLIFF IDやチャネルは不要。現在の実コンソール設定は未確認であり、以下は設定する値/確認項目。SDK初期化後に追加path/nextを解決し、ブラウザとサーバーの `meals`・`shopping` aliasを一致させる。

1. LINE Developers → 既存LINE Loginチャネル → LIFF → 現在利用中のアプリ。Endpoint URLが `https://familytodo.marinski1112.workers.dev/liff` なら維持する。変更前に現設定を控える。`/app/meals.php`をEndpoint URLに直接置き換えない。既存認証入口が必要。IDやscope、OAuth callbackを作り替えない。
2. LINE Official Account Manager → リッチメニュー。ごはんへの入口を設ける場合は、対象枠のアクションを『リンク』にして `https://liff.line.me/{既存LIFF ID}/meals` を指定し、画像の枠名も合わせる。食べたいものへ直行するなら `https://liff.line.me/{既存LIFF ID}/?next=%2Fapp%2Fmeals.php%3Fview%3Dwishlist`、受信箱なら末尾のwishlistをinboxにする。6枠のどれを置き換えるかは本人判断。LIFFアプリ数を増やさない。
3. 応答設定: WebhookはONを維持。問い合わせ不可の標準応答が重なる場合は『応答メッセージ』をOFFにするかその応答だけ変更する。アプリのWebhook返信は別に届く。Webhook URL、tokenは変更不要。未確認の管理画面をこちらで変更していない。
4. 変更後はLINEトークを開き直し、ごはん枠→表示、食べたい文章→受信箱、受信箱→希望→登録済みレシピを確認する。URL/動画解析は明示操作時のみ。リンクだけの確認でAIを呼ばない。

公式仕様: https://developers.line.biz/ja/docs/liff/opening-liff-app/ 、 https://developers.line.biz/ja/reference/liff/ 、 https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-menus/ 、 https://developers.line.biz/ja/docs/messaging-api/building-bot/ 。追加情報はliff.state経由で渡るため、liff.init完了前にURLを書き換えない。
