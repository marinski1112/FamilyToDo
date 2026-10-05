# URLからレシピを取り込む

レシピ一覧の「URLから取り込む」、またはLINE受信箱の同名ボタンから開始します。取得はログイン利用者の明示操作時だけです。確認・編集画面には料理名、人数、所要時間、材料、手順、出典URLを引き継ぎます。保存ボタンまでは登録レシピ・献立・買い物を変更しません。人数・時間・材料の曖昧な数量は空欄で、元の材料表記と出典リンクを表示します。

## 対応と制限

- HTTPSの `www.kurashiru.com/recipes/<UUID>` と `delishkitchen.tv/recipes/<数字>`（wwwも可）の公開ページ。追跡query/fragmentを除去します。
- JSON-LDの単一Recipe、配列、@graph、HowToSection/HowToStepに対応。複数Recipe、材料・手順を特定できないページは手入力へ。
- 材料の明確な末尾数値・単位、分数、大さじ/小さじを通常コードで抽出。数量の範囲、少々、適量、換算、AI推測は採用しません。ISO時間は分へ換算します。
- YouTubeは別の動画取り込み処理に対応（[仕様](youtube.md)）。その他のサイト、ログインを要するページは手入力。サイト側の取得拒否や構造変更でも手入力が利用できます。
- AIへの送信・モデル呼出しはありません。AI抽出は後続の独立した拡張です。

## 取得と保存

許可ホストとパスを完全一致で検証し、IP/内部ホスト・認証情報・非標準port・HTTPを拒否します。redirectはmanualで最大3回、各転送先を同じ規則で再検証。Cookie/Authorization等を転送しません。10秒timeout、2MB（展開後のstreamも計数）、text/htmlだけ。画像・動画・外部JSON-LD・instructionリンクを取得せず、スクリプトも実行しません。

専用DBの0004に家族別のrequest receiptと確認用draftを保存。家族ID/作成者は認証context由来。CSRF検証後に一意なclaimを取得し、同じrequest_id/URLの再送は成功/失敗を再利用し、重複した取得をしません。同じIDでURL変更は拒否します。新規取り込みは家族/UTC日20回まで（失敗も含む）。Workerがclaim後に中断したRUNNINGは再取得せず手入力へ案内。履歴は当面保持し、raw HTML/画像/動画、promptやAI回答は保存・ログ出力しません。確認画面から既存save_recipeの入力検証・revision・tenantルールで保存します。LINE受信箱は登録後に利用者が「確認済みにする」を操作します。

## 検証

26件の献立SQLite/API/DOMテスト、型・JS構文・静的参照を確認。URL拒否、転送先再検証、bytes/type制限、並行claim、成功/失敗再送、家族分離、利用上限、保存前の未変更、数量空欄、通信応答喪失からの再試行を含みます。公開デリッシュキッチン1ページのJSON-LD抽出を確認。ローカルChromiumのsyntheticデータで確認・空欄による保存拒否・補完後の保存、320/390/768pxのoverflowなしを確認。本番での家族ログイン操作は利用者確認待ちです。
