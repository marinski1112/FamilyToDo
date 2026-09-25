# Cleanup automation runbook

This runbook defines the safe execution contract for bounded FamilyToDo structural cleanup. Current `main`, runtime source, migrations, active regression contracts, `.github/workflows/ci.yml`, and `package.json` remain authoritative.

## Current coordination

Current coordination issue: **#1102**.

Issue #381 is archived historical evidence and must not be used for new leases, heartbeats, or coordination.

Before a write, actual-read:

1. current `main` SHA and package version;
2. open PRs and recent commits;
3. #1102 current lease state;
4. exact source/docs/tests relevant to the change.

Never reconstruct source from old chat, old SHA, historical issue comments, or partial output.

## One bounded concern

A cleanup change should address one bounded concern. Classify the candidate before changing it:

- `ACTIVE`
- `COMPAT`
- `TEST/CONTRACT`
- `HISTORICAL`
- `DEAD`
- `UNKNOWN`

`UNKNOWN` is never permission to delete. A zero-result GitHub code search is not proof of non-use; check direct routes/imports/static assets/contracts/cron/OAuth/webhook reachability where applicable.

## Write lease

Acquire the #1102 lease immediately before the contiguous GitHub write sequence:

```text
[LEASE:ACQUIRED] owner=<owner> scope=<bounded scope> base=<exact main SHA>
```

Rules:

- never commit directly to `main`;
- branch from the exact observed base SHA;
- one PR should represent one bounded concern;
- do not hold the lease during read-only investigation, CI waiting, review waiting, or deployment waiting;
- release the lease as soon as the contiguous write/merge critical section finishes.

Release format:

```text
[LEASE:RELEASED] owner=<owner> result=<PR/merge/parked summary>
```

If another active writer owns the lease, remain read-only or work on a non-overlapping investigation without GitHub writes.

## Current CI/CD model

### GitHub Actions

The repository currently has one GitHub Actions workflow: `.github/workflows/ci.yml`.

It runs on:

- every pull request;
- pushes to `main`.

Its `checks` job is the canonical repository test gate. It installs dependencies and runs TypeScript checks, targeted contracts, browser/static checks, migration smoke tests, the regression suite, and `git diff --check`.

For a code or documentation PR:

1. verify the PR head SHA;
2. require the GitHub Actions `CI` workflow for that head to finish successfully before merge;
3. inspect blocking review threads/comments if present;
4. confirm the PR is mergeable and still based on a compatible current `main`.

Do not weaken, skip, or delete regression checks merely to obtain green CI.

### Cloudflare preview/build signal

Cloudflare Git integration may attach a Workers preview/build result to PR commits. Treat that as an additional deployment/build signal when it is produced.

Do **not** encode a universal rule that every PR must expose a `Workers Builds: familytodo` check by that exact name. The Cloudflare build is external to `.github/workflows/ci.yml`, and its presentation/availability can vary independently of GitHub Actions.

For runtime/deployment-affecting changes, a failed Cloudflare preview/build is blocking until understood. For docs-only changes, absence of a Cloudflare preview is not by itself a reason to block merge when GitHub Actions CI is green.

### Production deploy and migrations

Production deployment is not performed by the GitHub Actions `CI` workflow.

The current repository deployment command is:

```text
npm run deploy
```

which executes:

```text
wrangler d1 migrations apply DB --remote && wrangler deploy
```

The production path is the authenticated Cloudflare Git integration triggered from `main`. Therefore:

- PR previews must not apply production D1 migrations;
- production D1 migrations are applied only from the `main` production deployment path;
- if migration application fails, `&&` prevents Worker deployment from continuing;
- ChatGPT must not directly operate production D1 as a substitute for this path;
- already-applied migrations are immutable; schema/index/column changes require a new migration.

### Post-merge verification

After merge:

- re-read the resulting `main` SHA;
- GitHub Actions CI on `main` is the canonical repository post-merge test signal;
- for runtime or migration changes, check available Cloudflare production deployment evidence when the connector/UI exposes it;
- do not claim production deployment or migration success without evidence;
- do not keep the #1102 write lease HELD merely while waiting for post-merge CI or Cloudflare deployment evidence.

A later corrective GitHub write requires a fresh actual-read and a new lease.

## Cloudflare Observability

Cloudflare Observability is not part of this cleanup/CI gate and must not be treated as required validation. Do not use it unless the user explicitly changes that policy for a separate task.

## Change-size guardrails

Default expectations:

- one semantic concern;
- preferably a small number of files;
- no unrelated cross-cutting refactor;
- no migration deletion during routine cleanup;
- no compatibility-route retirement without explicit reachability evidence;
- no source reconstruction.

If scope expands while investigating, stop before write and split/reclassify the work.

## Timezone/config guardrails

Canonical family time helpers are owned by `src/timezone.ts`. Family-facing logic should prefer the available family timezone. Do not mechanically remove `Asia/Tokyo`: `DEFAULT_FAMILY_TIMEZONE` and `APP_TIMEZONE` remain legitimate fallback/config values unless exact current source proves a bypass of available `family_timezone`.

Likewise, `new Date()` is not automatically a timezone defect. Infrastructure UTC timestamps can be correct; family wall-clock domain logic must be evaluated separately.

## Historical automation material

Older five-worker cleanup scheduling and #381 heartbeat/watchdog protocols are historical, not current execution requirements. `FIVE_WORKER_AUTONOMY.md` is retained only as an archived design note and must not override this runbook, #1102, current source, or current CI/CD configuration.
