# Cleanup automation runbook

This runbook defines the safe execution contract for future FamilyToDo structural-cleanup automation. It is a navigation and execution policy only. Current `main`, runtime source, migrations, and active regression contracts remain authoritative.

## Preconditions

Do not write unless all of the following are true:

1. current `main` SHA, package version, open PRs, recent commits, and issue #381 lease state were actual-read in the current run;
2. `docs/architecture/README.md`, the relevant architecture map, and the exact current source for the candidate were read;
3. the candidate is bounded to one concern;
4. reachability is evidenced across the applicable runtime/import/static/test/contract/cron/OAuth/webhook surfaces;
5. no conflicting write lease is HELD;
6. the change does not require reconstructing source that is absent from current `main`.

If any prerequisite is uncertain, classify the candidate as `UNKNOWN` and do not write.

## One-run limit

One run may perform at most one bounded cleanup concern.

Priority order:

1. canonical config/timezone drift;
2. completely equivalent helper duplication;
3. unused export or unreachable function with proven reachability evidence;
4. dead compatibility code after external/runtime callers are proven absent;
5. historical Wave artifact cleanup.

If no safe candidate exists, finish read-only and report `NO_SAFE_WRITE_CANDIDATE`.

## Required classification

Every candidate must be classified before change:

- `ACTIVE`
- `COMPAT`
- `TEST/CONTRACT`
- `HISTORICAL`
- `DEAD`
- `UNKNOWN`

`UNKNOWN` is never permission to delete.

A zero-result GitHub code search is not proof of non-use. Search indexes can be incomplete. Use direct current-source reads and route/import/contract evidence.

## Source reconstruction prohibition

Never recreate a source file or implementation from memory, prior chats, old SHAs, generated summaries, or historical assumptions.

If the expected source is absent from current `main`, report:

`source unavailable / current mainでは存在しない`

and leave it absent unless a separate user-scoped feature explicitly requires new implementation.

The retired task-new source is a known example: do not recreate it. A live compatibility URL such as `/task/new.php` must be judged from its current dispatcher/handler path, not from the historical filename.

## Active barrel-module warning

Small re-export modules are not automatically dead wrappers.

At baseline `aa8a49bbec8505d358525f40d335e76f9ecce395`, `src/page-routes.ts` directly imports these barrel modules:

- `src/auth-page-handlers.ts`
- `src/task-page-handlers.ts`
- `src/message-page-handlers.ts`
- `src/shopping-page-handlers.ts`
- `src/settings-page-handlers.ts`

They are therefore `ACTIVE` at module level. Consolidation would be an intentional route-ownership refactor, not unused-code deletion.

## Lease and branch protocol

Before any write, add a bounded lease to issue #381:

```text
[LEASE:ACQUIRED][<scope-id>]
owner=<worker>
base_main=<exact SHA>
scope=<one bounded concern>
status=HELD
cloudflare_observability=NOT_USED
```

Rules:

- never commit directly to `main`;
- create a short-lived branch from the exact observed base SHA;
- one PR = one bounded concern;
- do not mix structural cleanup with feature/bug work;
- PR body must state deletion/consolidation reason, canonical replacement, and reachability evidence.

## Validation protocol

Before merge:

1. re-read current `main` and ensure the base did not advance incompatibly;
2. verify the PR head SHA;
3. inspect all changed files/diff for scope drift;
4. require GitHub Actions CI success;
5. require `Workers Builds: familytodo` success;
6. require zero blocking review threads.

On CI failure, inspect the exact failed job/step/log. Distinguish source-string contract failures from runtime-behavior failures.

After merge, keep the lease HELD until all of the following succeed on the exact merged `main` SHA:

1. exact-main GitHub Actions CI;
2. exact-main Workers Build;
3. PR review-thread check;
4. current main SHA verification.

Then release:

```text
[LEASE:RELEASE][<scope-id>]
merged_pr=#<number>
merged_main=<exact SHA>
premerge_ci=SUCCESS
postmerge_exact_main=SUCCESS
workers_build=SUCCESS
open_threads=0
cloudflare_observability=NOT_USED
status=RELEASED
```

## Change-size guardrails

Default maximum per run:

- one semantic concern;
- preferably 1–5 files;
- no cross-cutting refactor across Google Calendar, Location, Family Log, AI, auth, or tenant boundaries;
- no DB schema/migration deletion during routine cleanup;
- no mass Wave-file deletion;
- no compatibility-route retirement without explicit reachability evidence.

If the candidate expands while investigating, stop before write and reclassify/split it.

## Timezone/config guardrails

Canonical family time helpers are owned by `src/timezone.ts`. Family-facing logic should prefer the available family timezone. Do not mechanically remove `Asia/Tokyo`: `DEFAULT_FAMILY_TIMEZONE` and `APP_TIMEZONE` are legitimate fallback/config values unless current source proves a bypass of available `family_timezone`.

Likewise, `new Date()` is not automatically a timezone defect. Infrastructure UTC timestamps can be correct; family wall-clock domain logic must be evaluated separately.

## Successful reference cleanup

PR #778 (`refactor: centralize family date offset helper`) is the first reference cleanup for this runbook:

- exact duplicate helper body/signature confirmed in two ACTIVE route modules;
- live callers were preserved;
- canonical owner moved to `src/timezone.ts`;
- no route/auth/tenant/DB/external behavior changed;
- pre-merge CI and Workers Build succeeded;
- exact-main post-merge CI and Workers Build succeeded;
- lease was released only after post-merge validation.

## Autonomous-task prompt contract

A future autonomous task should execute the following instruction each run:

```text
You are the FamilyToDo v1.00 bounded structural-cleanup worker.

Repository: marinski1112/FamilyToDo
Canonical branch: main
Coordination issue: #381
Timezone: Asia/Tokyo
Cloudflare Observability: do not use.

At the start of every run, actual-read current main SHA, package version, open PRs, recent commits, #381 lease state, docs/architecture/README.md, and the relevant architecture map. Never treat prior chat, memory, old SHA, or architecture docs as authoritative over current source.

Choose at most one bounded cleanup candidate, in this priority order:
P1 canonical config/timezone drift
P2 completely equivalent helper duplication
P3 unused export/unreachable function with proven reachability
P4 dead compatibility code with all callers proven absent
P5 historical Wave artifact cleanup

Before writing, prove applicable reachability across routes, imports, dynamic/string dispatch, static assets, tests/contracts, cron, OAuth callbacks, webhooks, and external compatibility URLs. A zero-result GitHub search is not proof of non-use.

Classify the candidate ACTIVE, COMPAT, TEST/CONTRACT, HISTORICAL, DEAD, or UNKNOWN. Never delete UNKNOWN. Never reconstruct source absent from current main. Do not recreate retired task-new source.

If no safe candidate exists, do not write and report NO_SAFE_WRITE_CANDIDATE.

If a safe candidate exists and #381 has no conflicting HELD lease, acquire a bounded lease, create a short-lived branch from exact current main, make only that change, update architecture navigation if source ownership changed, and open one PR. Never commit directly to main.

Require pre-merge GitHub Actions CI, Workers Builds: familytodo, and zero blocking review threads. If main advances incompatibly, stop/rebase/revalidate rather than blind merge. Merge only when all conditions pass.

After merge, verify exact merged-main GitHub Actions CI and Workers Build. Release the lease only after post-merge success. Never broaden the run into feature work, schema/migration cleanup, Google Calendar/Location/Family Log/AI/auth/tenant-wide refactors, or mass deletion.

One run = at most one bounded cleanup.
```

Do not schedule this task merely because this file exists. Scheduling requires an explicit user decision after the manual workflow is judged stable.
