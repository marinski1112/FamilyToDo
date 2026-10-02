# つち Android テスト版

## 最新版 v0.1.201

**[APKを直接ダウンロード](https://raw.githubusercontent.com/marinski1112/FamilyToDo/android-test-downloads/downloads/FamilyToDo-test-v0.1.201.apk)**

- アプリ名を「つち」、アイコンを提供された家族画像へ変更しました。
- チェックリストに「＋AI入力」を追加。タスク・イベント・買い物・持ち物の種類と選択日を引き継ぎ、既存の認証済みAIフォームをアプリ内で開きます。
- カレンダーの日付セル・日跨ぎ帯: 短押し（300ms未満）でチェックリストへ。300〜899ms押して離すと、見切れた予定を全文の一覧で確認。900ms以上で日付の操作メニュー。スクロール・複数指・押下の取り消しでは動作しません。スタンプ自身は画像表示・スタンプ操作を維持します。
- 伝言の長押しから「Google Homeで読み上げる」。本文、またはスタンプのタイトルを選んで読み上げます。下書きは入力欄の＋から利用できます。接続先を選んだあと、読み上げボタンを押してください。
- Android 11以降の日本語TTSエンジン検出を設定し、狭い画面でイベントタブが折り返されないようにしました。

### Google Homeの対応範囲

即時読み上げはGoogle Castによる音声再生です。電話とGoogle Homeを同じWi-Fiへ接続し、再生終了まで読み上げ画面を開いてください。スピーカーで再生中の音声は切り替わります。Castの成功表示は「再生依頼を受け付けた」という意味で、実機で音が出たことを確認する必要があります。日本語の端末音声合成エンジンが必要です。

常設の中継端末がない構成のため、アプリからの自動送信・読み上げ予約、外出先からの再生、Google Homeへの声の返信を伝言へ自動で文字追加する機能は未対応です。予約はGoogle Homeの「自動化」で時刻・ブロードキャスト本文を手動設定するためのコピー導線を用意しました。既存の「通知予約」は伝言を今すぐ保存し、通知時刻を予約する機能です。

### インストール

旧版と署名が異なるため、旧アプリを削除してから新規インストール・再ログインしてください。削除前に未送信の下書きを控えてください。端末の設定・未送信データは削除されます。Webに保存済みの家族データは削除しません。固定署名は未整備です。

### 検証

ソース: `26fb956b7564d659f84871c2b8ddbd621c4b924a`
[Android CI 201](https://github.com/marinski1112/FamilyToDo/actions/runs/37027814880)
[通常CI 3169](https://github.com/marinski1112/FamilyToDo/actions/runs/37027815033)

通常/Preview/隔離E2E/Releaseビルドと、Android 11/15・360dp・ライト/ダークの架空fixture操作テスト・画面を確認しました。押下時間の境界、ドラッグ/取消し、AI入口、イベントタブの文字幅、音声配信GET/HEAD/Range/不正URL、既存のチェックリスト・カレンダー・伝言・家族ログ・設定・集計の回帰が対象です。実データへのテスト書き込みはしていません。

Google Home実機の発見・接続・実音声、LINEログイン・GPS・写真・通知、Galaxy固有IME/通信復旧、固定署名、オフライン保存は未確認または未完了です。Webとの完全一致も未確認です。

APK SHA256: `074a96152706d68b72a298e91e1d6ad3cb2f96290066c5a5212f4d601ea6ce8d`
署名証明書 SHA256: `742f4a80f3c52443bd957b9eb4fa834ef928367c25871f8e2198b8ee0ed7e003`

[実装範囲・残件](https://github.com/marinski1112/FamilyToDo/blob/feat/android-location-starter/android/UI_PARITY.md)
[ドラフトPR #1143](https://github.com/marinski1112/FamilyToDo/pull/1143)

以前の配布版: [v0.1.196](https://raw.githubusercontent.com/marinski1112/FamilyToDo/android-test-downloads/downloads/FamilyToDo-test-v0.1.196.apk)
