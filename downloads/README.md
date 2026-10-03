# 公開準備版：本番API未公開

セットの新APIを含むmainコミット e30b0543ef345c23db45cfa99f4c5ebc187d6f19 のCloudflare Workers Buildが失敗しています。このAPKの新しいセット呼び出しは、本番デプロイが完了するまで使えません。通常の配布ページの最新版はv0.1.203を維持しています。

Android CI 205（ビルド・Android 11/15 UI）と通常CI 3175は成功。APK署名・バージョンを確認済みです。

# つちだけ Android テスト版

## 最新版 v0.1.205

**[① APKを直接ダウンロード](https://raw.githubusercontent.com/marinski1112/FamilyToDo/android-test-downloads/downloads/FamilyToDo-test-v0.1.205.apk)**

- 買い物・持ち物のセットを開いて、日付・必要な項目・追加先カテゴリを指定して追加できます。初期選択なし、全て選択/解除、未分類指定、失敗時の選択保持と同じIDでの再試行、連打防止。元のセットは変更しません。Web/APIの対応は [#1149](https://github.com/marinski1112/FamilyToDo/pull/1149) に含みます。
- アプリ名を「つちだけ」、アイコンを提供された家族画像へ変更しました。
- チェックリストに「＋AI入力」を追加。タスク・イベント・買い物・持ち物の種類と選択日を引き継ぎ、既存の認証済みAIフォームをアプリ内で開きます。
- カレンダーの日付セル・日跨ぎ帯: 短押し（300ms未満）でチェックリストへ。300〜899ms押して離すと、見切れた予定を全文の一覧で確認。900ms以上で日付の操作メニュー。スクロール・複数指・押下の取り消しでは動作しません。スタンプ自身は画像表示・スタンプ操作を維持します。
- 伝言の長押しから「Google Homeで読み上げる」。本文、またはスタンプのタイトルを選んで読み上げます。下書きは入力欄の＋から利用できます。接続先を選んだあと、読み上げボタンを押してください。
- Android 11以降の日本語TTSエンジン検出を設定し、狭い画面でイベントタブが折り返されないようにしました。

- Google Homeの切断・中止・タイムアウト後に古い処理が再生を始める問題と、処理待ちから戻らない問題を修正。準備が90秒を超えると打ち切り、再試行できます。音声配信は10分で終了します。

### Google Homeの対応範囲

即時読み上げはGoogle Castによる音声再生です。電話とGoogle Homeを同じWi-Fiへ接続し、再生終了まで読み上げ画面を開いてください。スピーカーで再生中の音声は切り替わります。Castの成功表示は「再生依頼を受け付けた」という意味で、実機で音が出たことを確認する必要があります。日本語の端末音声合成エンジンが必要です。

この配布版ではアプリからの自動送信・読み上げ予約、外出先からの再生、Google Homeへの声の返信を伝言へ自動で文字追加する機能は未対応です。外出先読み上げは、追加の自宅端末を置かずに公式Home Automation APIを使う方法を調査済みですが、SDK取得・Android OAuth設定・固定署名が未整備のため未実装です。詳しくは [導入条件](https://github.com/marinski1112/FamilyToDo/blob/feat/android-location-starter/android/GOOGLE_HOME_REMOTE.md) を参照してください。予約はGoogle Homeの「自動化」で時刻・ブロードキャスト本文を手動設定するためのコピー導線を用意しました。既存の「通知予約」は伝言を今すぐ保存し、通知時刻を予約する機能です。

### インストール

旧版と署名が異なるため、旧アプリを削除してから新規インストール・再ログインしてください。削除前に未送信の下書きを控えてください。端末の設定・未送信データは削除されます。Webに保存済みの家族データは削除しません。固定署名は未整備です。

### 検証

ソース: `27ddc7994dd2e0957a146615b97fdf1dd35c1b75`
[Android CI 205](https://github.com/marinski1112/FamilyToDo/actions/runs/37099715925)
[通常CI 3175](https://github.com/marinski1112/FamilyToDo/actions/runs/37099715867)

通常/Preview/隔離E2E/Releaseビルドと、Android 11/15・360dp・ライト/ダークの架空fixture操作テスト・画面を確認しました。セットの選択項目のみ送信・未分類指定・失敗保持・同一IDの再試行・二重送信防止、押下時間の境界、ドラッグ/取消し、AI入口、イベントタブの文字幅、音声配信GET/HEAD/Range/不正URL、要求状態・取消し後の遅延結果破棄・接続中の配信期限切れ、既存のチェックリスト・カレンダー・伝言・家族ログ・設定・集計の回帰が対象です。実データへのテスト書き込みはしていません。

Google Home実機の発見・接続・実音声、LINEログイン・GPS・写真・通知、Galaxy固有IME/通信復旧、固定署名、オフライン保存は未確認または未完了です。Webとの完全一致も未確認です。

APK SHA256: `b4f143a12954444ff414fcc83a6cf905029014a0738f8d35797b041df759ca36`
署名証明書 SHA256: `b999c3f55e88c3ed8a0b7c702eafe6a77350702fa7a71bccd7a3619aa7537546`

[実装範囲・残件](https://github.com/marinski1112/FamilyToDo/blob/feat/android-location-starter/android/UI_PARITY.md)
[ドラフトPR #1143](https://github.com/marinski1112/FamilyToDo/pull/1143)

以前の配布版: [v0.1.203](https://raw.githubusercontent.com/marinski1112/FamilyToDo/android-test-downloads/downloads/FamilyToDo-test-v0.1.203.apk)、 [v0.1.196](https://raw.githubusercontent.com/marinski1112/FamilyToDo/android-test-downloads/downloads/FamilyToDo-test-v0.1.196.apk)
