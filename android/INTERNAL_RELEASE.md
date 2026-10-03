# 内部配布APKの準備

`.github/workflows/android-internal.yml` は同じ署名鍵で更新できる内部用APKを作るための手動ワークフローです。現在のドラフトPRでは設計とビルド経路のみ用意しています。Android用APIの接続先と実機E2Eが揃うまでは配布しません。

## 署名鍵

鍵は一度だけ安全な端末で作り、バックアップを保管します。鍵を失うと同じパッケージ名のAPKを更新できません。鍵・パスワード・base64値をIssue、PR、リポジトリ、Actionsログに貼らないでください。

```sh
keytool -genkeypair -v -keystore familytodo-internal.jks -alias familytodo-internal \
  -keyalg RSA -keysize 3072 -validity 10000
base64 -w 0 familytodo-internal.jks
```

GitHubリポジトリのActions Secretsに次の四つを設定します。

| Secret | 内容 |
| --- | --- |
| `FAMILYTODO_KEYSTORE_B64` | JKSファイル全体のbase64（改行なし） |
| `FAMILYTODO_STORE_PASSWORD` | キーストアのパスワード |
| `FAMILYTODO_KEY_ALIAS` | 作成時の別名 |
| `FAMILYTODO_KEY_PASSWORD` | 秘密鍵のパスワード |

`android-internal.yml` がデフォルトブランチへ反映された後、Actionsから手動実行できます。ワークフローは本番URL固定のrelease APKをビルドし、署名・検証した `familytodo-android-internal` artifactを7日間保存します。鍵が未設定なら失敗し、署名されていないAPKは公開しません。実行番号を使ってAndroidのversionCodeを増やします。

デバッグAPKと内部配布APKは同じアプリIDで署名が異なります。最初の移行時はデバッグAPKを削除してから内部配布APKをインストールしてください。端末内キャッシュと位置共有のSecretは削除されます。以後は同じ鍵の内部配布APKで更新します。プレビューAPKは別アプリIDなので併存できます。

配布の前に、対象コミットのWeb CI・Android CI、実際に接続するAPI、LINEログイン、位置共有の停止と復旧、端末での上書き更新を確認します。CIのビルド成功だけで実機動作やAPI互換性は確定しません。
