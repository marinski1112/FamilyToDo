# Legacy / Wave cleanup inventory

Baseline label: **FamilyToDo v1.00**. This is a development-stability baseline, not a package-version reset.

Current `main`, runtime source, migrations, `wrangler.jsonc`, and active regression contracts are authoritative. This inventory records cleanup rules and the current classification boundary; Git history is the archive for artifacts already proven historical and removed.

## Evidence-first classification

Every deletion/consolidation candidate must be classified before removal:

- **ACTIVE** — reached by current Worker dispatch, scheduled execution, imports, build/static-asset flow, or an actively maintained operational/development path.
- **COMPAT** — old-looking path or adapter that still serves a current compatibility URL/caller.
- **TEST/CONTRACT** — protects current behavior even when not part of runtime imports.
- **HISTORICAL** — point-in-time documentation/artifact with no current runtime/build/contract role; Git history is sufficient replacement.
- **DEAD** — proven unreachable from runtime, build, static assets, active routes, scheduled execution, contracts/tests, and known dynamic dispatch.
- **UNKNOWN** — evidence is incomplete; do not delete.

## Required proof before deletion

Check the relevant current-main boundaries before removing a candidate:

1. `src/index.ts` request and scheduled dispatch;
2. route owner modules and imports/exports;
3. public/static asset and service-worker references;
4. package scripts, regression manifest and active contracts/tests;
5. migration/schema dependencies;
6. string/dynamic dispatch and compatibility aliases;
7. Google/LINE/LIFF/OAuth/webhook/external callback URLs;
8. Cloudflare build/config entrypoints.

A filename containing `wave`, an old version number, or a zero-result GitHub search is not deletion evidence by itself. A small re-export/barrel module is also not automatically dead.

## Current verified active/compatibility boundaries

| Path / pattern | Class | Evidence / action |
| --- | --- | --- |
| `src/index.ts` | ACTIVE | Worker entrypoint and scheduled dispatcher; keep |
| `src/public-routes.ts` | ACTIVE | first request dispatcher; keep |
| `src/context-api-routes.ts` | ACTIVE | authenticated API dispatcher; keep |
| `src/page-routes.ts` | ACTIVE | page dispatcher; keep |
| `src/exception-routes.ts` | ACTIVE/COMPAT | owns live early/prelude/fallback and compatibility routes; audit per route before any retirement |
| `src/auth-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts`; keep |
| `src/task-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts`; keep |
| `src/message-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts`; keep |
| `src/shopping-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts`; keep |
| `src/settings-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts`; keep |
| numbered `migrations/*.sql` | ACTIVE/SCHEMA | migration history is the canonical D1 schema lineage; never delete as Wave-document cleanup |
| active architecture maps/runbooks under `docs/architecture/` | ACTIVE | maintained navigation, ownership and cleanup contracts; source wins if they drift |
| `docs/architecture/GOOGLE_HOME_FUNCTION_MAP.md` | ACTIVE | canonical Google Home ownership plus current operator/setup reference; active Google Home contracts validate this map |
| `docs/GOOGLE_HOME_VOICE_SETUP.md` | COMPAT | one-line symlink to `architecture/GOOGLE_HOME_FUNCTION_MAP.md`; preserves the legacy filename for any remaining contract/caller without duplicating historical Wave content |
| `README.md`, `database/README.md` | ACTIVE | current repository/database operating guidance; keep |
| `docs/EXTERNAL_SERVICE_COSTS.md` | ACTIVE | dated external-service cost/privacy guardrail; retain while maintained and revalidate changing provider limits |
| `docs/import/piyolog-conversion-prompt.md` | ACTIVE | current Family Log/PiyoLog import workflow input; keep with the import contract |

## Historical Markdown audit

A full Markdown audit was performed from exact main `93c56e97ceff0b74f5f261576d01af68c23cf2a4`. The repository had **36 Markdown files** at that boundary. Each removal below was actual-read and checked against current source/config/routes/migrations/contracts as applicable; search misses were supplemental evidence only.

### Removed as HISTORICAL

The following **17** point-in-time or superseded documents were archived by Git history and removed from the working tree in the full Markdown audit:

- `CHANGELOG_CLOUDFLARE_WAVE78.md`
- `CHANGELOG_CLOUDFLARE_WAVE93.md`
- `FAMILY_LOG_DESIGN_WAVE78.md`
- `MIGRATION_PROGRESS_WAVE11.md`
- `MIGRATION_PROGRESS_WAVE12.md`
- `MIGRATION_PROGRESS_WAVE13.md`
- `MIGRATION_PROGRESS_WAVE14.md`
- `MIGRATION_PROGRESS_WAVE15.md`
- `MIGRATION_PROGRESS_WAVE17.md`
- `MIGRATION_PROGRESS_WAVE18.md`
- `MIGRATION_PROGRESS_WAVE19.md`
- `README_WAVE15.md`
- `WAVE36_ANALYSIS.md`
- `docs/ENVIRONMENT_RECOVERY_WAVE117.md`
- `docs/GOOGLE_TASKS_VOICE_BRIDGE_WAVE115.md`
- `docs/rough-input-event-calendar-cleanup.md`
- `docs/architecture/ASTRA_AI_JOURNAL_PHASE1_AUDIT.md`

Classification rationale:

- `CHANGELOG_*`, `MIGRATION_PROGRESS_*`, `README_WAVE15.md`, and `WAVE36_ANALYSIS.md` are release/progress/parity snapshots. Current source, migrations, route/owner maps and contracts represent the live behavior.
- `FAMILY_LOG_DESIGN_WAVE78.md` mixes a historical domain snapshot and then-future backlog. Current Family Log/Journal source, migration chain and active contracts supersede it.
- `docs/ENVIRONMENT_RECOVERY_WAVE117.md` is a one-time recovery snapshot with Wave/version-specific assumptions. Stable recovery safety guidance is consolidated into the root `README.md`.
- `docs/GOOGLE_TASKS_VOICE_BRIDGE_WAVE115.md` is superseded by current Google Tasks source/migrations and `GOOGLE_TASKS_FUNCTION_MAP.md`; stable OAuth/list-selection/operator guidance is consolidated there.
- `docs/rough-input-event-calendar-cleanup.md` describes one completed bounded change and a deferred route audit. Current `ROUTE_MAP.md` and source now own those boundaries.
- `docs/architecture/ASTRA_AI_JOURNAL_PHASE1_AUDIT.md` explicitly records an older baseline and phased backlog. Current Family AI/Google Home/Google Tasks maps plus current source/contracts supersede the snapshot.

### Subsequent operator-doc consolidation

`docs/GOOGLE_HOME_VOICE_SETUP.md` was a cumulative Wave114/120/121/122/124 setup history. Its still-current Console, LINE Login continuation, Scene capability, recorder identity, HomeGraph Request Sync and credential-separation guidance is consolidated into `docs/architecture/GOOGLE_HOME_FUNCTION_MAP.md`. The historical Markdown body is removed and preserved only in Git history; the legacy path remains as a one-line COMPAT symlink to the canonical map so any residual filename consumer does not require duplicate documentation. Google Home regression contracts are being repointed to the canonical map directly.

### Earlier historical removals

Earlier bounded cleanup PRs removed other proven historical Wave changelogs/residual analyses, including Wave31/33 documentation and the Wave37–78 residual-analysis batches. Detailed per-file justification remains in Git/PR history and is intentionally not duplicated here. The associated numbered migrations were preserved.

## Consolidation rule

Do not create a new Wave-specific Markdown file for current operating instructions when an existing canonical document can own the information. Prefer:

- root `README.md` for repository-wide development, secrets and recovery guidance;
- `database/README.md` for schema-source rules;
- `docs/architecture/GOOGLE_HOME_FUNCTION_MAP.md` for current Google Home ownership and operator setup;
- domain ownership maps under `docs/architecture/` for other current implementation boundaries;
- `docs/import/` for actively used import instructions.

Historical implementation notes belong in Git/PR history once their current guidance has been consolidated.

## Git-history principle

Once a file is proven HISTORICAL or DEAD and its current behavior or stable operating guidance is represented by canonical source/contracts/docs, Git history is the archive. Keeping every point-in-time implementation note in the working tree increases search noise and should not be the default.

The execution guardrails for autonomous cleanup are defined in `CLEANUP_AUTOMATION_RUNBOOK.md`; the lane/collision policy is defined in `FIVE_WORKER_AUTONOMY.md`.
