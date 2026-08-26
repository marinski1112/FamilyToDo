# Cloudflare D1 Wave49

## Production diagnosis and task lifecycle hardening

- Added `/__cf/db-runtime-health` for critical application query smoke tests.
- Request errors now include a correlation/request ID while the detailed exception remains in Workers Observability.
- Task creation validates active family assignees.
- Task creation cleans up newly-created task/child rows after a subsequent write failure.
- No D1 migration was added.
