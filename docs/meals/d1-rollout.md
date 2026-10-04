# 専用D1接続と有効化

所有者から受け取ったfamilytodo-mealsのdatabase_id:
`55874b27-fe42-43f1-b0c6-2e0b66ad6da8`

wrangler.jsoncに `MEALS_DB` と `migrations_dir: ./meals-migrations` を追加。既存 `DB` のIDとmigration先は維持。実際にこのIDが当該Cloudflareアカウントのfamilytodo-mealsを指すことはリモート接続前には未検証です。

本PRは #1152 / #1153 / #1156 / #1154 / #1155 の変更を統合してmainへ反映します。途中状態のWorkerを何度もデプロイせず、AI呼出し制限・料理ルート・Web献立・LINE受信箱・専用DBを同じ反映に含めます。

## 反映

Cloudflare認証がある環境で、このブランチの内容を取り込んだcheckoutから実行:

```sh
npm ci
npx wrangler whoami
npx wrangler d1 info MEALS_DB
npm run deploy
```

`deploy` は既存DBのmigrations（0115 AI制限・0116 shopping projectionを含む）→MEALS_DBの0001/0002→Worker deployの順で実行し、途中失敗時は次へ進みません。DBを指定してSQLファイルを手動実行する方法ではなく、それぞれのbindingに対応したmigration directoryを使用します。有効化はdeploy時の `MEALS_ENABLED:true` 指定で行います。`deploy:meals` は `deploy` の別名です。所有者確認済みのCloudflare Workers Buildsコマンド `npm run deploy` をそのまま使用します。

Cloudflare Workers Buildsはmainへの取り込みで `npm run deploy` を実行します。migration成功後だけWorkerの有効化を行います。設定ファイル単体には未準備DBに対する自動有効化フラグを加えません。

## 反映後の確認

- 所有者ともう1人の家族でごはん画面を開き、レシピ・食べたいものの共有を確認。
- 5品の確定、食材選択→既存買い物へ追加、同じ操作の再送で重複しないことを確認。
- 個別LINEトークの「カレー食べたい」→受信箱→食べたいものを確認。
- 従来の家族の状況、予定、伝言、買い物と6タブを確認。
- 別家族の内容が見えないこと、未ログイン時に内容が出ないことを確認。

初期反映はWebのみ。AI生成、Cooking Live、Androidの献立UIは後続です。

## 実環境の準備状態

`GET /__cf/meals-health` は有効化・binding・必要テーブルの準備状態だけをbooleanで返します。家族データ、DB ID、鍵やraw errorを返しません。有効な機能のテーブルが欠けている場合は503です。実際のCloudflareコマンドが不明でも、この結果で必要なmigrationが揃ったことを確認できます。
