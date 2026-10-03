# 外出先から伝言を読み上げるための導入条件

状態: 調査・設計済み。SDK未取得・Google Home OAuth未設定のため、配布APKには未実装。
自宅にはGoogle Homeだけを置く方針。常設PC/AndroidやHome Assistantは要求しない。

## 利用する公式API

- Google Home Automation APIの `AssistantBroadcast` は、構造またはスピーカーへ本文を読み上げるactionとして利用できる。Device/Structure APIからの直接呼び出しには対応しない。
- `manualStarter()` を持つautomationを作成し、`execute()` で送信時に実行する構成を検証する。外出中のモバイル回線からの実行・実スピーカーの発声は未確認。
- 任意メッセージをGoogle Home単体へWorkerから直接送信する汎用REST APIは今回確認できなかった。Android側のHome SDKとユーザーのGoogle Home権限で実行する。
- 旧Google Assistant SDKは、公式の対応表ではBroadcast非対応。採用しない。

## 必要な準備

1. [Home APIs SDK](https://developers.home.google.com/apis/android/sdk)をGoogleアカウントでサインインして取得する。オープンベータのSDKは通常Mavenライブラリではなく手動取得のため、現在の実行環境では未取得。
2. 固定署名を整備する。既存の `INTERNAL_RELEASE.md` の非公開署名ワークフローを使う。鍵・パスワードをソースやIssueへ置かない。
3. [OAuth](https://developers.home.google.com/apis/android/oauth)にAndroidアプリ `jp.marinski.familytodo` と固定署名のSHA-1を登録し、対象Googleアカウントをテストユーザーとして設定する。既存Web/Calendar OAuthとは分ける。
4. アプリ内でGoogle Homeアクセスを要求し、読み上げ先の家とスピーカーを選ぶ。Android 11はSDKのAndroid 10以上という条件を満たすが、端末実験は別途必要。

## 送信時の動作

- 伝言入力欄に「送信後Google Homeで読み上げる」を追加。初期OFF。接続・権限未設定時にはセットアップへ案内し、利用可能と誤表示しない。
- 本文とスタンプのタイトルを組み立て、宛先・読み上げ本文を確認可能にする。
- 先に既存の伝言APIで保存する。保存に失敗した場合は読み上げない。
- 保存成功後、送信要求に結び付けたGoogle Home automationを作成・実行する。連打・遅延結果・セッション変更を無効化する。
- 読み上げ依頼に失敗しても伝言を再送しない。「伝言は保存済み／読み上げ未完了」と表示し、読み上げのみ再試行する。実行受付と実際の発声を区別する。
- 結果不明の場合は自動再実行せず、重複発声を避ける。本文を含むautomationの削除タイミングと失敗時の掃除をSDK実装で検証する。
- SDKテストは許可されたテストアカウントで行う。実家庭へ無断で読み上げる検証はしない。

## 予約・声の返信

予約読み上げは別途日時starterと期限を設計し、繰り返し再生・古い伝言の発声を防ぐ。Home Automation APIのスケジュール条件と構造の住所要件を確認する。
Google Homeが聞いた声の返信を第三者アプリへ転送する公開APIは今回確認できていない。声の返信自動文字起こしは未対応のままとする。

公式参照:
- https://developers.home.google.com/apis/android/automation/supported-traits
- https://developers.home.google.com/reference/kotlin/com/google/home/google/AssistantBroadcast
- https://developers.home.google.com/apis/android/automation/build
- https://developers.home.google.com/apis/android/automation/examples

2026-10-03確認。SDKの版、対応スピーカー、Googleアカウント認可、モバイル回線での実行は実装時に再確認する。
