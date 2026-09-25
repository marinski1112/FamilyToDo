# FamilyToDo v1.00 architecture index

This directory is the development navigation index for the current FamilyToDo baseline.

## Authority rule

This documentation is **not** a source of truth. Runtime source, current `main`, migrations, active regression contracts, `.github/workflows/ci.yml`, and `package.json` are authoritative.

At the start of a development unit, read current `main`, open PRs, recent commits, and coordination issue **#1102** before using this index. Historical issue #381 is archived and must not be used for new leases or coordination.

Baseline used to create the first index: `787d3633ba365318fea13027d72df67ffb66eda3` (`12.148.0-wave128`). The label **v1.00** is a product/development baseline name only; it does not reset the npm package version.

When source and this index disagree, source wins and the index should be updated with the structural change.

## Fast-path development workflow

1. Read current main SHA, package version, open PRs, recent commits, and #1102 lease state.
2. Start from this index instead of recursively rediscovering the whole repository.
3. Read the relevant route/handler/helper/config/contract subgraph from current source.
4. If the map differs from source, update the map; do not force source to match stale documentation.
5. Keep changes bounded. Do not mix broad legacy deletion with behavior fixes.

## Current CI/CD model

- Repository CI is defined by `.github/workflows/ci.yml` and runs on pull requests and pushes to `main`.
- GitHub Actions `CI` is the canonical repository test gate before merge.
- Cloudflare Git integration is a separate external build/deploy path. When it produces a PR preview/build result, use it as additional deployment evidence; do not assume one fixed GitHub check name exists for every PR.
- Production deployment from `main` uses `npm run deploy` from `package.json`.
- `npm run deploy` executes `wrangler d1 migrations apply DB --remote && wrangler deploy`; migration failure therefore prevents Worker deployment.
- PR previews must not apply production D1 migrations.
- The #1102 write lease is held only during contiguous GitHub write/merge operations, not while waiting for CI/review/deployment evidence.

See `CLEANUP_AUTOMATION_RUNBOOK.md` for the detailed current execution rules.

## Index files

- `ROUTE_MAP.md` — Worker dispatch order and canonical route-owner modules.
- `CONFIG_FUNCTION_MAP.md` — canonical config/function ownership and duplicate/drift candidates.
- `AUTH_FUNCTION_MAP.md` — authentication, session and CSRF ownership.
- `FAMILY_MEMBERSHIP_FUNCTION_MAP.md` — family creation/join/invitation/member administration ownership.
- `CALENDAR_FUNCTION_MAP.md` — calendar rendering, task/event projection and related ownership.
- `NOTIFICATION_FUNCTION_MAP.md` — notification creation, scheduling, delivery and diagnostics ownership.
- `FAMILY_AI_FUNCTION_MAP.md` — Family AI planning/provider/action ownership and safety boundaries.
- `GOOGLE_HOME_FUNCTION_MAP.md` — Google Home account linking, operator setup, LINE continuation, SYNC/EXECUTE, Request Sync and Scene ownership.
- `GOOGLE_TASKS_FUNCTION_MAP.md` — Google Tasks OAuth, inbound synchronization, routing and voice-command ownership.
- `PIYOLOG_IMPORT_FUNCTION_MAP.md` — PiyoLog/Family Log import parsing, duplicate/media and persistence boundaries.
- `LEGACY_INVENTORY.md` — classification rules for active, compatibility, historical, dead, and unknown files.
- `CLEANUP_AUTOMATION_RUNBOOK.md` — current bounded-change execution, #1102 lease, CI/CD, migration/deploy, and source-reconstruction rules.
- `FIVE_WORKER_AUTONOMY.md` — archived historical five-worker design; not a current scheduling or CI contract.

Current operator/workflow documentation that is intentionally outside this directory includes `../EXTERNAL_SERVICE_COSTS.md` and `../import/piyolog-conversion-prompt.md`. Google Home operator setup is maintained in `GOOGLE_HOME_FUNCTION_MAP.md`; `../GOOGLE_HOME_VOICE_SETUP.md` is only a compatibility symlink for residual filename consumers and contains no separate Wave-specific documentation.

## Cleanup safety classes

| Class | Meaning | Default action |
| --- | --- | --- |
| ACTIVE | Reached by current runtime/build flow | Keep |
| COMPAT | Current compatibility entrypoint or adapter | Keep until callers are migrated |
| TEST/CONTRACT | Runtime-independent regression protection | Keep or consolidate carefully |
| HISTORICAL | History-only artifact with no current runtime/build/contract role | Candidate for removal; Git history remains |
| DEAD | Proven unreachable from runtime/build/static assets/contracts and not dynamically addressed | Remove in a bounded PR |
| UNKNOWN | Evidence is incomplete | Do not remove |

A filename containing `wave` or an old number is not evidence that a file is dead. Small re-export/barrel modules are also not inherently dead; current route imports must be checked before treating a wrapper as removable.

## Structural cleanup policy

The cleanup sequence remains conservative:

1. map current canonical paths;
2. inventory duplicate functions/config sources and legacy files;
3. prove reachability/non-reachability;
4. remove or consolidate one bounded class at a time;
5. run the current GitHub Actions CI gate and inspect relevant external build evidence when available;
6. update this index with each structural change.

The current cleanup contract is defined in `CLEANUP_AUTOMATION_RUNBOOK.md`. Historical five-worker scheduling is not enabled by any document in this directory.
