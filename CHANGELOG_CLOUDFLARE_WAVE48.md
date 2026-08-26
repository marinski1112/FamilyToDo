# Cloudflare D1 Wave48

## Production 500 investigation / schema hardening

- Investigated the reported `GET /app/settings.php` and `POST /api/task` 500s. The two failures are consistent with a deployed Worker running against a D1 schema that is behind the source migrations (for example missing `members.deleted_at`, `tasks.calendar_color`, or another migration-added column).
- Added `/__cf/db-schema-health` to report required table/column presence and the D1 migration ledger without exposing application data.
- Global request errors now distinguish likely D1 schema errors and return HTTP 503 with `DB_SCHEMA_MIGRATION_REQUIRED` instead of an opaque 500.
- Request failures now log path, method, error name and message to Workers Observability, making the next failure actionable.
- Kept the application behavior unchanged when the schema is correct.

## Deployment note

`package.json` already uses `wrangler d1 migrations apply DB --remote && wrangler deploy`. Cloudflare documents that D1 migrations are tracked in `d1_migrations` and are applied with `wrangler d1 migrations apply`; a plain `wrangler deploy` does not by itself apply pending D1 migrations unless the deployment workflow explicitly runs that command.
