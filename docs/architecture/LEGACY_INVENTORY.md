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
| `WAVE31_UPDATE_README.md` | HISTORICAL | one-time Wave30→31 ZIP placement/deploy instruction; it references the Wave31 changelog, migration progress note, source snapshot paths, and migration 0008 only as update-package contents; current runtime/build/deploy ownership is in current source/config/CI and does not consume this instruction | Git history; current source/config/CI | removed in corrected Wave31/33 cleanup |
| `MIGRATION_PROGRESS_WAVE31.md` | HISTORICAL | checked-off Wave31 implementation progress snapshot; its intentionally-retained events/event_members state was superseded by later migration 0009 and current schema/runtime | Git history; retained migrations 0008/0009 and current source/schema | removed in corrected Wave31/33 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE31.md` | HISTORICAL | documentation-only Wave31 task-only/LIFF migration notes; the remaining explicit reference was from `WAVE31_UPDATE_README.md`, which is itself a historical one-time update instruction; migration 0008 and current task/LIFF behavior remain independently represented | Git history; retained migration 0008 and current task/LIFF source/contracts | removed in corrected Wave31/33 cleanup |
| `migrations/0008_wave31_task_only.sql` | ACTIVE/SCHEMA | current migration chain migrates legacy event-backed rows into tasks and task-linked child references, then clears legacy event_id references before later physical removal | current migration chain | keep; never delete as changelog cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE33.md` | HISTORICAL | documentation-only Wave33 legacy-event-removal/lifecycle/UI notes; physical removal remains represented by migration 0009 and current task/schema/runtime contracts | Git history; retained migration 0009 and current task/schema/contracts | removed in corrected Wave31/33 cleanup |
| `migrations/0009_wave33_drop_legacy_events.sql` | ACTIVE/SCHEMA | current migration chain clears remaining legacy event references/indexes and physically drops event_members and events after the Wave31 task migration boundary | current migration chain | keep; never delete as changelog cleanup |
| `WAVE37_RESIDUAL_ANALYSIS.md` … `WAVE46_RESIDUAL_ANALYSIS.md` | HISTORICAL | ten point-in-time residual-analysis snapshots recording fixes and then-current follow-up targets; all ten were actual-read on exact main before removal. Current README declares current source/migrations/config/contracts authoritative, package scripts/CI do not consume these top-level Markdown files, and exact-filename searches found no current repository references as supplemental evidence | Git history; current source/migrations/contracts and architecture maps | removed in bounded Wave37-46 residual cleanup |
| `WAVE{47,48,49,50,52,53,54,55,56,57}_RESIDUAL_ANALYSIS.md` | HISTORICAL | ten point-in-time residual/fix-analysis snapshots covering already-landed recurrence, D1, calendar, shopping, invitation and mobile-form changes plus then-current follow-up targets; all ten were actual-read on exact main before removal. Current README declares current source/migrations/config/contracts authoritative, CI consumes executable source/assets/migrations/contracts rather than top-level Markdown, and exact-filename searches found no current repository references as supplemental evidence | Git history; current source/migrations/contracts and architecture maps | removed in bounded Wave47-57 residual cleanup |
| `WAVE58_RESIDUAL_ANALYSIS.md` … `WAVE67_RESIDUAL_ANALYSIS.md` | HISTORICAL | ten point-in-time residual/fix-analysis snapshots covering already-landed calendar, recurrence, D1, shopping, invitation, browser-script and mobile UI changes plus then-current follow-up targets; all ten were actual-read on exact main before removal. Current README declares current source/migrations/config/contracts authoritative, CI consumes executable source/assets/migrations/contracts rather than top-level Markdown, and exact-filename searches found no current repository references as supplemental evidence | Git history; current source/migrations/contracts and architecture maps | removed in bounded Wave58-67 residual cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE100.md` | HISTORICAL | documentation-only 12.119.0/Wave100 operational and migration notes; Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans ts/js/mjs/html; regression manifest contains executable checks only and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE101.md` | HISTORICAL | documentation-only 12.120.0/Wave101 behavior and follow-up notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE102.md` | HISTORICAL | documentation-only 12.121.0/Wave102 reliability/status notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE103.md` | HISTORICAL | documentation-only 12.122.0/Wave103 Calendar/Family AI hardening notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE104.md` | HISTORICAL | documentation-only 12.123.0/Wave104 Gemini/Google Home connection notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; sole CI workflow runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume this Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE105.md` | HISTORICAL | documentation-only Wave105 Family AI/Google Calendar/Google Home regression notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; CI runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume top-level Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded W4 cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE106.md` | HISTORICAL | documentation-only 12.125.0/Wave106 Family AI provider/configuration and operations notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; root README does not link it; CI runs npm/script checks only; static-asset contract scans only ts/js/mjs/html; regression suite executes manifest-defined checks and does not consume top-level Markdown; exact-filename search had no references as supplemental evidence | Git history | removed in bounded manual cleanup |
| `CHANGELOG_CLOUDFLARE_WAVE107.md` | HISTORICAL | documentation-only Wave107 Family AI signed-write architecture/operations notes; current Worker entrypoint is `src/index.ts`; Workers assets are `./public`; CI/regression consume executable source/contracts rather than this Markdown; exact-filename search had no references as supplemental evidence; referenced migration `migrations/0035_wave107_family_ai_actions.sql` exists separately and is preserved | Git history; retained migration/current source/contracts | remove changelog only; keep migration 0035 |
| `migrations/0035_wave107_family_ai_actions.sql` | ACTIVE/SCHEMA | current migration creates `family_ai_action_receipts` and index used by Wave107-era signed action persistence | current migration chain | keep; never delete as changelog cleanup |
| top-level `*wave*` / Wave-era artifacts | UNKNOWN | remaining artifacts not yet reachability-audited | TBD | do not delete yet |
| former duplicate local `asDateOffset()` helpers | canonicalized duplicate | identical ACTIVE callers and helper semantics verified before centralization | `src/timezone.ts#asDateOffset()` | keep canonical helper; no local copies |

## Git-history principle

Once a file is proven HISTORICAL or DEAD and its current behavior is represented by canonical source/contracts, repository history is the archive. Keeping every historical implementation in the working tree increases search noise and should not be the default.

The execution guardrails for any autonomous cleanup are defined in `CLEANUP_AUTOMATION_RUNBOOK.md`.
