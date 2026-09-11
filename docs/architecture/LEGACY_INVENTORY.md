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

A small re-export module is not automatically dead. Barrel modules can be intentional route ownership boundaries and must be checked from current importers before consolidation or removal.

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

## Current verified active barrel modules

At baseline `aa8a49bbec8505d358525f40d335e76f9ecce395`, `src/page-routes.ts` directly imports the following re-export/barrel modules:

- `src/auth-page-handlers.ts`
- `src/task-page-handlers.ts`
- `src/message-page-handlers.ts`
- `src/shopping-page-handlers.ts`
- `src/settings-page-handlers.ts`

They are **ACTIVE** at module level. Their wrapper-only shape is not unused-code evidence. Any future consolidation must be treated as an intentional route/module-ownership refactor and revalidated against current source.

## Inventory table

Populate this table from current-main evidence during cleanup PRs. Keep UNKNOWN entries rather than guessing.

| Path / pattern | Class | Evidence | Canonical replacement | Action |
| --- | --- | --- | --- | --- |
| `src/index.ts` | ACTIVE | Worker entrypoint and scheduled dispatch | — | keep |
| `src/public-routes.ts` | ACTIVE | first request dispatcher | — | keep |
| `src/context-api-routes.ts` | ACTIVE | authenticated API dispatcher | — | keep |
| `src/page-routes.ts` | ACTIVE | page dispatcher | — | keep |
| `src/exception-routes.ts` | ACTIVE/COMPAT | early/prelude/fallback live routes | route-specific | audit per route |
| `src/auth-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts` | underlying auth/onboarding/home page modules | keep; do not classify as dead wrapper |
| `src/task-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts` | underlying task/item page modules | keep; do not classify as dead wrapper |
| `src/message-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts` | underlying message page modules | keep; do not classify as dead wrapper |
| `src/shopping-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts` | underlying shopping page modules | keep; do not classify as dead wrapper |
| `src/settings-page-handlers.ts` | ACTIVE | directly imported by `src/page-routes.ts` | underlying settings page modules | keep; do not classify as dead wrapper |
| `CHANGELOG_CLOUDFLARE_WAVE10.md` | HISTORICAL | documentation-only v12.35/Wave10 migration notes; exact filename has no current repository references; root README does not link it; package/CI do not consume top-level Markdown; static-asset contract scans only ts/js/mjs/html | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE100.md` | HISTORICAL | documentation-only 12.119.0/Wave100 operational and migration notes; Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans ts/js/mjs/html; regression manifest contains executable checks only and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE101.md` | HISTORICAL | documentation-only 12.120.0/Wave101 behavior and follow-up notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE102.md` | HISTORICAL | documentation-only 12.121.0/Wave102 reliability/status notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE103.md` | HISTORICAL | documentation-only 12.122.0/Wave103 Calendar/Family AI hardening notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE104.md` | HISTORICAL | documentation-only 12.123.0/Wave104 Gemini/Google Home connection notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE105.md` | HISTORICAL | documentation-only Wave105 Family AI/Google Calendar/Google Home regression notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; CI runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume top-level Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| top-level `*wave*` / Wave-era artifacts | UNKNOWN | remaining artifacts not yet reachability-audited | TBD | do not delete yet |
| former duplicate local `asDateOffset()` helpers | canonicalized duplicate | identical ACTIVE callers and helper semantics verified before centralization | `src/timezone.ts#asDateOffset()` | keep canonical helper; no local copies |

## Git-history principle

Once a file is proven HISTORICAL or DEAD and its current behavior is represented by canonical source/contracts, repository history is the archive. Keeping every historical implementation in the working tree increases search noise and should not be the default.

The execution guardrails for any autonomous cleanup are defined in `CLEANUP_AUTOMATION_RUNBOOK.md`.
