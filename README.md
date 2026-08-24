# Family TODO LINE — Cloudflare migration foundation

This directory is a **parallel migration workspace** based on `FamilyTODO_v12_35_full_latest.zip`.
The XREA/PHP source is not modified by this migration scaffold.

## Architecture

- Cloudflare Workers: runtime for PHP replacement code
- D1: Cloudflare-native SQLite database for the migrated application
- Workers Static Assets: CSS/images/static files
- Worker Secrets: LINE secrets, application secret, notification secret
- Cron Triggers: reserved for the existing notification job; not enabled yet because the current app uses `notify_mode=manual`

Cloudflare D1 is the active database target for this migration. D1 is accessed through the Workers Binding API with SQLite-compatible prepared statements. See the official documentation:

- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Important safety rule

Do not put the existing XREA database password, LINE Channel Secret, LINE Access Token, or other credentials into this repository. The source ZIP contained production-looking credentials; this migration package intentionally excludes those values.

Rotate those credentials before the Cloudflare production cutover if the ZIP has been shared outside the intended trusted environment.

## First Cloudflare setup (do not change DNS yet)

1. Install Node.js LTS and npm.
2. Open a terminal in this `cloudflare` directory.
3. Run `npm install`.
4. Run `npx wrangler login`.
5. Create or bind the Hyperdrive configuration for the existing MySQL database. Replace the placeholders with the actual DB host/user/password/database values that are currently used by XREA:

   `npx wrangler hyperdrive create familytodo-db --connection-string="mysql://USER:PASSWORD@HOST:3306/DATABASE"`

6. The D1 database is already bound in `wrangler.jsonc`.
7. Apply the schema remotely with `npx wrangler d1 migrations apply familytodo --remote`.
8. Copy `.dev.vars.example` to `.dev.vars` and enter **staging/test credentials only** if you have them.
9. Run `npx wrangler dev --remote`.
10. Test:
   - `http://localhost:8787/__cf/health`
   - `http://localhost:8787/__cf/db-health`

Do not change the domain DNS or the LINE webhook until the staging worker and database connection have been verified.

## Secret setup for Cloudflare

For production/staging, use Wrangler secrets instead of `vars`:

- `npx wrangler secret put LINE_CHANNEL_SECRET`
- `npx wrangler secret put LINE_CHANNEL_ID`
- `npx wrangler secret put LINE_LIFF_ID`
- `npx wrangler secret put LINE_ACCESS_TOKEN`
- `npx wrangler secret put APP_SECRET`
- `npx wrangler secret put NOTIFY_SECRET`

## Current migration status

Implemented in this foundation:

- Worker entry point
- static asset delivery
- D1/SQLite adapter
- encrypted stateless session cookie
- CSRF verification primitive
- LINE ID-token verification primitive
- LINE webhook signature verification
- compatibility URLs for the existing LIFF login and webhook endpoints
- health checks
- scheduled handler placeholder

Not yet migrated:

- all PHP page rendering
- all form POST/redirect flows
- full task/item/shopping/message CRUD
- calendar UI/API behavior
- recurrence engine
- notification business logic
- family creation/join
- settings/admin pages
- existing LINE message behavior

Those are intentionally left as TODOs so this foundation does not accidentally replace a working XREA implementation with incomplete code.


### Cloudflare Workers の型定義について

Cloudflare の現行推奨方式に合わせ、`@cloudflare/workers-types` の日付固定版には依存しません。Wrangler v4 の `wrangler types` で `worker-configuration.d.ts` を生成し、`tsconfig.json` はその生成ファイルを参照します。これにより、Cloudflare の compatibility date と実行環境に対応した型が生成されます。
