# Family TODO LINE — Cloudflare migration foundation

This directory is a **parallel migration workspace** based on `FamilyTODO_v12_35_full_latest.zip`.
The XREA/PHP source is not modified by this migration scaffold.

## Architecture

- Cloudflare Workers: runtime for PHP replacement code
- Hyperdrive: connection from Workers to the existing MySQL database
- Workers Static Assets: CSS/images/static files
- Worker Secrets: LINE secrets, application secret, notification secret
- Cron Triggers: reserved for the existing notification job; not enabled yet because the current app uses `notify_mode=manual`

Cloudflare currently recommends Hyperdrive for existing MySQL databases, and `mysql2@3.13.0+` is supported with the Promise API. See the official documentation:

- https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/
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
5. Create the Hyperdrive configuration for the existing MySQL database. Replace the placeholders with the actual DB host/user/password/database values that are currently used by XREA:

   `npx wrangler hyperdrive create familytodo-db --connection-string="mysql://USER:PASSWORD@HOST:3306/DATABASE"`

6. Copy the returned Hyperdrive ID into `wrangler.jsonc` in place of `REPLACE_WITH_HYPERDRIVE_ID`.
7. Copy `.dev.vars.example` to `.dev.vars` and enter **staging/test credentials only** if you have them.
8. Run `npx wrangler dev`.
9. Test:
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
- Hyperdrive/MySQL adapter
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
