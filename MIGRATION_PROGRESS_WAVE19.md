# Wave19 migration status

## Added
- `recurrence_rules.week_numbers_json`
- Existing recurrence rows are initialized from `week_number`.

## Deploy
The repository `package.json` deploy command already applies remote D1 migrations before Worker deploy:

`wrangler d1 migrations apply DB --remote && wrangler deploy`

No manual SQL execution is required if Cloudflare builds using the repository deploy command.

## Validation
- TypeScript `tsc --noEmit`: PASS
- SQL placeholder count for recurrence INSERT: PASS
- Migration file included in full and update packages.
