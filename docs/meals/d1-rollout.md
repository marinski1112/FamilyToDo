# 専用D1接続と有効化

所有者から受け取ったfamilytodo-mealsのdatabase_id:
`55874b27-fe42-43f1-b0c6-2e0b66ad6da8`

wrangler.jsoncに `MEALS_DB` と `migrations_dir: ./meals-migrations` を追加。既存 `DB` のIDとmigration先は維持。実際にこのIDが当該Cloudflareアカウントのfamilytodo-mealsを指すことはリモート接続前には未検証です。

このPRは #1155 の上に積みます。取り込み順は #1152 → #1153 → #1156 → #1154 → #1155 → 本PRです。どのPRも本番未反映の段階で作成しています。

## 反映

Cloudflare認証がある環境で、このブランチの内容を取り込んだcheckoutから実行:

```sh
npm ci
npx wrangler whoami
npx wrangler d1 info MEALS_DB
npm run deploy:meals
```

`deploy:meals` は既存DBのmigrations（0115 AI制限・0116 shopping projectionを含む）→MEALS_DBの0001/0002→Worker deployの順で実行し、途中失敗時は次へ進みません。DBを指定してSQLファイルを手動実行する方法ではなく、それぞれのbindingに対応したmigration directoryを使用します。有効化はdeploy時の `MEALS_ENABLED:true` 指定で行います。通常の `npm run deploy` も両DBのmigrationを先に適用しますが、新たな有効化指定はしません。

Cloudflare Workers Builds側が直接 `wrangler deploy` を実行する設定なら、初回は上記コマンドでDBを準備してから反映してください。外部のBuild commandの現在値は未検証です。設定ファイルには未準備DBに対する自動有効化フラグを加えません。

## 反映後の確認

- 所有者ともう1人の家族でごはん画面を開き、レシピ・食べたいものの共有を確認。
- 5品の確定、食材選択→既存買い物へ追加、同じ操作の再送で重複しないことを確認。
- 個別LINEトークの「カレー食べたい」→受信箱→食べたいものを確認。
- 従来の家族の状況、予定、伝言、買い物と6タブを確認。
- 別家族の内容が見えないこと、未ログイン時に内容が出ないことを確認。

初期反映はWebのみ。AI生成、Cooking Live、Androidの献立UIは後続です。
