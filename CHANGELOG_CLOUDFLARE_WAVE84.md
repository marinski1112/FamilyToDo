# Cloudflare Wave84 — 12.103.0-wave84

## PRIVATE privacy hardening

- Centralized the inherited item/shopping visibility predicate and applied it to shopping lists, filters, expired rows, detail payloads, category candidates, home counts, calendar/daily reads, and content administration.
- PRIVATE child creation and editing retains the accessible private parent and forces the private owner as the sole operational assignee. Ordinary shared-object selectors continue to expose FAMILY tasks only.
- Prevented administrators from converting another member's FAMILY task into their own PRIVATE task.
- Suppressed shared activity metadata for PRIVATE item creation and retained the common private-aware logger behavior.
- Added PRIVATE integrity diagnostics using only entity IDs and issue types.

## UI

- Task lists display a compact lock badge for the owner's PRIVATE tasks.
- Tasks with no linked shopping no longer render an empty details panel; the compact add action remains.

## CI and verification

- Wave83 source checks now use Node instead of runner-specific `rg` (the main failure cause was `rg` being unavailable on the GitHub-hosted runner).
- Wave84 smoke applies all migrations to a temporary SQLite database and asserts owner/member/admin visibility, inherited child/category/count/content visibility, assignments, notifications, and parent retention.
- No migration was added; existing migrations are unchanged.
