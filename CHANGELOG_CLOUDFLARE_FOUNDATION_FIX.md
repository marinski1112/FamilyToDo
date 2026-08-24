# Cloudflare foundation dependency fix

## 修正内容

- `@cloudflare/workers-types` の不正な `^4.20260819.0` 指定を削除。
- Cloudflare Workers の現行推奨方式に合わせ、Wrangler v4 の `wrangler types` で `worker-configuration.d.ts` を生成する構成へ変更。
- `tsconfig.json` の `types` を `./worker-configuration.d.ts` に変更。

## 目的

Cloudflare のビルド環境で発生していた以下の依存解決エラーを解消するための修正です。

`No version matching "^4.20260819.0" found for specifier "@cloudflare/workers-types"`

## 注意

この修正は依存解決のみを対象とします。DNS、LINE Webhook、LIFF URL、Hyperdrive ID、Secrets は変更していません。
