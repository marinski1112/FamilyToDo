# Database schema sources

`migrations/` is the canonical D1 schema history. Apply every numbered migration in order for a new database, and use `npm run check:migrations` as a local smoke test.

`schema.d1.sql` is a legacy v12.35-era reference snapshot only. It is intentionally not the deployable or current schema and must not be used instead of the migrations.
