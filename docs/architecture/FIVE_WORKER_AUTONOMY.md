# Five-worker autonomy contract

This document defines the safe split for five scheduled FamilyToDo cleanup workers. Current `main`, current source, migrations, active contracts, and issue #381 remain authoritative. `CLEANUP_AUTOMATION_RUNBOOK.md` applies to every worker.

## Shared invariants

All five workers must actual-read current main SHA, package version, open PRs, recent commits, #381 lease state, `docs/architecture/README.md`, this file, the cleanup runbook, and the exact current source relevant to their lane.

No worker may reconstruct source absent from current main. A GitHub code-search zero is never proof of non-use. `UNKNOWN` is no-delete. Cloudflare Observability is not used.

There is exactly one shared write lease in issue #381. A worker that finds any conflicting HELD lease performs read-only inventory and exits without writing. No direct commits to main. One run may create at most one bounded PR. After merge, the lease stays HELD until exact-main GitHub Actions and Workers Build succeed and review threads are clear.

## Worker lanes

### W1 — Config / Timezone

Primary candidates:
- canonical config ownership drift;
- family-timezone bypasses where current `family_timezone` is available;
- exact duplicate config/fallback definitions with proven equivalent semantics.

Must not mechanically remove `Asia/Tokyo`, `APP_TIMEZONE`, `DEFAULT_FAMILY_TIMEZONE`, or infrastructure UTC usage.

Suggested schedule: every hour at minute 05.

### W2 — Duplicate Helpers

Primary candidates:
- same-signature, same-body local helpers;
- duplicated pure transformation helpers with identical error/context semantics;
- duplicated small routing-neutral utility logic.

Do not centralize duplicated SQL/business rules unless transaction boundaries and side effects are proven identical.

Suggested schedule: every hour at minute 15.

### W3 — Reachability / Unused

Primary candidates:
- private/local functions with no callers;
- exported functions only after static, dynamic/string-dispatch, route, asset, contract, cron, OAuth/webhook checks;
- stale static assets only after HTML/JS/PWA/service-worker references are checked.

A search miss alone is insufficient. If evidence is incomplete, classify UNKNOWN and do not write.

Suggested schedule: every hour at minute 25.

### W4 — Compatibility / Historical

Primary candidates:
- compatibility aliases with replacement path and callers proven migrated;
- historical Wave artifacts with no runtime/build/test/contract/external role;
- legacy wrappers only when current source proves they are not ACTIVE/COMPAT/TEST-CONTRACT.

Do not retire external callback URLs, LIFF/OAuth/webhook endpoints, cron entrypoints, migrations, or old-looking `.php` compatibility paths without explicit reachability evidence. Do not recreate retired task-new source.

Suggested schedule: every hour at minute 35.

### W5 — Final Auditor / Gatekeeper

Read-only by default. It does not select a new cleanup candidate and does not create cleanup PRs.

Every run:
- actual-read current main/open PRs/recent checks/#381;
- verify no worker left a stale HELD lease after a merged/closed PR;
- inspect open cleanup PRs for scope drift, cross-lane overlap, blocking review threads, failed CI, or failed Workers Build;
- verify architecture docs still match current source where touched by recent cleanup;
- report whether the four writer lanes remain safe to continue.

W5 may not merge or modify code merely to make another worker pass. It may only report a blocking condition. Any future emergency-write exception requires separate explicit policy.

Suggested schedule: every hour at minute 45.

## Cross-worker collision rules

1. The #381 lease is global, not per-lane.
2. A second worker must not create a branch/PR while another cleanup lease is HELD.
3. If main advances while a worker is preparing a candidate, re-read and revalidate before write.
4. If an open cleanup PR already touches the same canonical owner or adjacent route/helper subgraph, the later worker exits read-only with `LANE_OVERLAP`.
5. W1–W4 each produce at most one PR per run; W5 produces none.
6. A worker may classify candidates outside its lane for inventory, but must not write outside its lane.
7. DB schema/migration deletion, broad Google Calendar/Location/Family Log/AI/auth/tenant refactors, mass deletion, and feature work remain outside autonomous cleanup.

## Per-run result vocabulary

Use one of:
- `NO_SAFE_WRITE_CANDIDATE`
- `LEASE_BUSY`
- `LANE_OVERLAP`
- `PR_OPENED`
- `PR_MERGED_VALIDATED`
- `BLOCKED_CI`
- `BLOCKED_REVIEW`
- `BLOCKED_MAIN_ADVANCED`
- `AUDIT_OK`
- `AUDIT_BLOCKING`

## Readiness criterion for five scheduled tasks

Five-task scheduling is permitted when:
- the bounded cleanup runbook is on current main;
- at least one runtime-neutral cleanup has completed full pre/post-merge validation;
- this five-worker contract is on current main;
- #381 lease acquire/release is functioning;
- open PR state is clean at activation;
- all task prompts preserve the global lease and lane limits above.

The five tasks should be staggered at minutes 05/15/25/35/45 in Asia/Tokyo. Exact scheduling reduces simultaneous inventory and the global lease prevents overlapping writes if a run lasts longer than its slot.
