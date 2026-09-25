# Five-worker autonomy contract — archived

Status: **HISTORICAL / RETIRED**

This document is retained only to explain an earlier FamilyToDo cleanup-worker design. It is **not** a current scheduling, lease, CI, merge, or deployment contract.

The previous five-worker set used issue #381, periodic heartbeats, fixed lane schedules, and a rule that kept the write lease held while waiting for exact-main GitHub Actions and Workers Build completion. Those assumptions are obsolete.

## Current authority

For present work, use:

1. current `main` and exact current source;
2. `.github/workflows/ci.yml` for the repository CI definition;
3. `package.json` for the current deployment command;
4. `docs/architecture/CLEANUP_AUTOMATION_RUNBOOK.md` for bounded cleanup execution policy;
5. coordination issue **#1102** for the shared write lease and current blockers.

Issue #381 is archived and locked.

## Current CI/CD summary

- GitHub Actions `CI` runs on pull requests and pushes to `main` and is the canonical repository test gate.
- Cloudflare Git integration is external to that workflow. A produced preview/build result is additional evidence, especially for runtime changes, but an exact check name such as `Workers Builds: familytodo` is not a universal repository-level requirement.
- Production deployment is triggered from `main` through the authenticated Cloudflare Git integration using `npm run deploy`.
- `npm run deploy` applies remote D1 migrations and only then deploys the Worker: `wrangler d1 migrations apply DB --remote && wrangler deploy`.
- PR previews must not apply production D1 migrations.
- The #1102 write lease is held only for contiguous GitHub writes/merge operations; it is not held while waiting for CI, review, or deployment evidence.

## Historical lane layout

The retired design split cleanup into W1 Config/Timezone, W2 Duplicate Helpers, W3 Reachability/Unused, W4 Compatibility/Historical, and W5 Final Auditor. Those labels may still appear in Git history or old comments, but they do not imply that any scheduled automation is active or should be re-enabled.

Do not recreate or re-enable historical worker sets solely because this file exists.
