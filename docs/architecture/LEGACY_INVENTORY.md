# Legacy / Wave cleanup inventory

Baseline label: **FamilyToDo v1.00**. This is a development-stability baseline, not a package-version reset.

The repository has accumulated historical Wave-era files and compatibility paths. Cleanup should reduce active search space without deleting live runtime or regression behavior.

## Evidence-first classification

Every candidate must be assigned one of these states before removal:

- **ACTIVE** — reached by current Worker dispatch, scheduled execution, current imports, build/static asset flow, or active feature path.
- **COMPAT** — old-looking path or adapter that still serves a current compatibility URL/caller.
- **TEST/CONTRACT** — protects current behavior even when not part of runtime imports.
- **HISTORICAL** — retained only as a historical artifact; Git history is sufficient replacement.
- **DEAD** — proven unreachable from runtime, build, static assets, active routes, scheduled execution, contracts/tests, and known dynamic dispatch.
- **UNKNOWN** — evidence is incomplete; do not delete.

## Required proof before deletion

A Wave/history file is removable only after checking, as applicable:

1. current `src/index.ts` dispatch/scheduled graph;
2. route owner modules;
3. TypeScript imports/exports;
4. public/static asset references;
5. package scripts and regression manifest/contracts;
6. migrations/schema references;
7. string/dynamic dispatch and URL compatibility aliases;
8. Google/LINE/LIFF callbacks or external webhook URLs;
9. Cloudflare build/config entrypoints.

The fact that a file is old, contains `wave`, or is not found by GitHub code search is insufficient evidence. GitHub search can be incomplete.

## Consolidation strategy

Use small, reviewable PRs:

1. documentation/index only;
2. proven duplicate helper/config consolidation;
3. proven DEAD/HISTORICAL top-level artifacts;
4. compatibility-route retirement only after caller migration/evidence;
5. optional CI drift checks for architecture ownership.

Do not combine mass deletion with functional bug fixes.

## Current verified compatibility warning

`src/exception-routes.ts` contains live exceptional/compatibility paths, including recurring authentication handling, OAuth/LIFF prelude handling, check/reorder aliases, webhook aliases, task delete/occurrence conversion, and new-entry pages. It is therefore ACTIVE/COMPAT at module level; individual routes require separate classification.

## Inventory table

Populate this table from current-main evidence during cleanup PRs. Keep UNKNOWN entries rather than guessing.

| Path / pattern | Class | Evidence | Canonical replacement | Action |
| --- | --- | --- | --- | --- |
| `src/index.ts` | ACTIVE | Worker entrypoint and scheduled dispatch | — | keep |
| `src/public-routes.ts` | ACTIVE | first request dispatcher | — | keep |
| `src/context-api-routes.ts` | ACTIVE | authenticated API dispatcher | — | keep |
| `src/page-routes.ts` | ACTIVE | page dispatcher | — | keep |
| `src/exception-routes.ts` | ACTIVE/COMPAT | early/prelude/fallback live routes | route-specific | audit per route |
| top-level `*wave*` / Wave-era artifacts | UNKNOWN | not yet reachability-audited | TBD | do not delete yet |
| duplicate local `asDateOffset()` helpers | duplicate candidate | current `page-routes.ts` and `exception-routes.ts` | TBD canonical date helper | audit/centralize separately |

## Git-history principle

Once a file is proven HISTORICAL or DEAD and its current behavior is represented by canonical source/contracts, repository history is the archive. Keeping every historical implementation in the working tree increases search noise and should not be the default.