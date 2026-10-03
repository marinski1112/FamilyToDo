# 固定署名で継続配布するための準備

遠隔Google HomeのSDKテストAPK206はDebug署名です。継続配布用の鍵は別に用意します。
この変更は鍵作成・登録・署名確認の手順を準備するもので、実際の秘密鍵やGitHub Secretsを変更しません。
秘密鍵は所有者の端末で保管し、パスワードはチャットやGitリポジトリに貼り付けないでください。

## スマホのみの場合

Google Cloudの公式モバイルアプリからCloud Shellを開く方法を使います。
Googleの公式手順: https://support.google.com/cloud/answer/6143581?hl=ja
長期保管の注意: https://docs.cloud.google.com/shell/docs/quotas-limits

1. Google CloudアプリでGoogleアカウントと対象プロジェクトを選択します。
2. 右上のプロフィール写真の横にあるCloud Shellアイコン（>_）をタップします。
3. 端末上でPython・keytool・GitHub CLIを確認します。必要な準備とGitHubログインを済ませます。
4. 下記セットアップスクリプトをCloud Shellのホームディレクトリにダウンロードして実行します。
   スクリプト単体でも実行でき、鍵はGitリポジトリの外に置きます。
5. 出力された公開SHA-1でGoogleのAndroid OAuthを設定します。
6. 鍵ファイルはスマホの安全な保管先へダウンロードして別途バックアップします。

Cloud Shellのホームディレクトリは永続ディスクですが、長期間未使用時に削除される条件があります。
Cloud Shellだけを唯一の鍵の保管先にはしません。公開共有リンクは作りません。
Google Cloud画面とGitHubログインは所有者側で操作します。チャットへパスワードを送る必要はありません。

## 所有者の端末で一度だけ行うこと

JDK 17、Python 3.9以上、GitHub CLIを使います。GitHub CLIでは対象リポジトリのSecretsを設定できるアカウントでログインします。

```sh
gh auth login
python3 android/tools/setup_fixed_signing.py --configure-github-secrets
```

Windowsでは `python3` を `python` に置き換えます。
パスワードは非表示の入力欄で入力し、パスワードマネージャーに保管します。
初回だけ秘密鍵を作成し、次回は同じ鍵を使います。既存ファイルを作り直しません。
鍵ファイルは標準でユーザーのホームディレクトリの `.familytodo-signing/familytodo-internal.jks` に保存します。
別の安全な場所にも秘密鍵をバックアップし、公開ファイル共有は使いません。

既に所有する鍵を使う場合は、ファイルとaliasを指定できます。

```sh
python3 android/tools/setup_fixed_signing.py --keystore /private/path/existing.jks --alias existing-alias
```

このコマンドは公開証明書のSHA-1とSHA-256だけを表示します。
既存の鍵ではstore passwordとkey passwordが異なっていても入力できます。
鍵をリポジトリ内に作成・配置する指定は拒否します。

## GitHubへの登録

`--configure-github-secrets` を指定すると、次の値をGitHub CLIの標準入力で設定します。
秘密鍵・パスワード・Base64は画面に表示しません。

| 名前 | 内容 |
|---|---|
| FAMILYTODO_KEYSTORE_B64 | 秘密鍵ファイルのBase64 |
| FAMILYTODO_STORE_PASSWORD | keystoreのパスワード |
| FAMILYTODO_KEY_ALIAS | 鍵のalias |
| FAMILYTODO_KEY_PASSWORD | 鍵のパスワード |
| FAMILYTODO_SIGNING_CERT_SHA256 | 配布APKで固定する公開証明書SHA-256 |

これらが既に一つでも設定されている場合は、既存の署名を変更しないため自動登録を拒否します。
登録が途中で失敗した場合も新しい鍵を作らず、同じ鍵を使って残りを手動で登録します。
以前の4項目が設定済みの場合は、既存の鍵から出したSHA-256を5項目目に追加してください。
公開証明書のフィンガープリントと秘密鍵ファイルは別のものです。

## Googleと配布APK

出力された固定鍵のSHA-1と `jp.marinski.familytodo` をGoogle CloudのAndroid OAuthクライアントに登録します。
SDKテストAPK206のDebug証明書とは違うため、固定署名のAPKを試す場合には固定鍵のSHA-1を使います。
Google認証の登録画面はアカウント所有者の端末から操作する必要がある場合があります。

「Android internal APK」ワークフローは、設定の有無をビルド開始前に確認します。
署名成功後も公開証明書SHA-256が一致しないAPKは配布せず、署名時の一時鍵ファイルは成功・失敗いずれでも削除します。
初回の固定署名版は既存Debug版に上書きできません。未送信内容を控え、アンインストールしてから再ログインします。
その後は同じ鍵と増加するversionCodeで更新できます。

このワークフローの通常ビルドにはGoogle Home SDKは含まれません。
SDK対応版は `docs/android-google-home-remote.md` のローカルMaven指定でReleaseを作成し、同じ固定鍵で署名します。
SDK ZIPをリポジトリや公開配布ページに追加しないでください。

## 検証

```sh
python3 android/tools/test_fixed_signing.py
```

使い捨て鍵で、鍵の再利用、誤ったパスワードの拒否、リポジトリへの秘密鍵作成の拒否、既存Secretsの保護、署名ピンの不一致・複数署名の拒否を確認します。
実際の署名ステップも使い捨て鍵で実行し、同じ証明書で二度署名できること、不一致時の配布停止と一時鍵削除を確認しました。
