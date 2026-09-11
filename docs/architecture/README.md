# FamilyToDo v1.00 architecture index

This directory is the development navigation index for the current FamilyToDo baseline.

## Authority rule

This documentation is **not** a source of truth. Runtime source, current `main`, migrations, and active regression contracts are authoritative. At the start of every development unit, read current `main`, open PRs, recent commits, and the coordination lease before using this index.

Baseline used to create the first index: `787d3633ba365318fea13027d72df67ffb66eda3` (`12.148.0-wave128`). The label **v1.00** is a product/development baseline name only; it does not reset the npm package version.

When source and this index disagree, source wins and the index must be updated in the same structural change.

## Fast-path development workflow

1. Read current main SHA, package version, open PRs, recent commits, and issue #381 lease.
2. Start from this index instead of recursively rediscovering the whole repository.
3. Read the relevant route/handler/helper/config/contract subgraph from current source.
4. If the map differs from source, update the map; do not force source to match stale documentation.
5. Keep changes bounded. Do not mix broad legacy deletion with behavior fixes.

## Index files

- `ROUTE_MAP.md` — Worker dispatch order and canonical route-owner modules.
- `CONFIG_FUNCTION_MAP.md` — canonical config/function ownership and duplicate/drift candidates.
- `LEGACY_INVENTORY.md` — classification rules for active, compatibility, historical, dead, and unknown files.
- `CLEANUP_AUTOMATION_RUNBOOK.md` — one-bounded-change cleanup execution contract, lease/CI/Workers flow, source-reconstruction prohibition, and autonomous-task prompt contract.

## Cleanup safety classes

| Class | Meaning | Default action |
| --- | --- | --- |
| ACTIVE | Reached by current runtime/build flow | Keep |
| COMPAT | Current compatibility entrypoint or adapter | Keep until callers are migrated |
| TEST/CONTRACT | Runtime-independent regression protection | Keep or consolidate carefully |
| HISTORICAL | History-only artifact with no current runtime/build/contract role | Candidate for removal; Git history remains |
| DEAD | Proven unreachable from runtime/build/static assets/contracts and not dynamically addressed | Remove in a bounded PR |
| UNKNOWN | Evidence is incomplete | Do not remove |

A filename containing `wave` or an old number is not evidence that a file is dead.

Small re-export/barrel modules are also not inherently dead. Current route imports must be checked before treating a wrapper as removable.

## Structural cleanup policy

The cleanup sequence is intentionally conservative:

1. map current canonical paths;
2. inventory duplicate functions/config sources and legacy files;
3. prove reachability/non-reachability;
4. remove or consolidate one bounded class at a time;
5. run the full regression suite and Workers Build;
6. update this index with each structural change.

The autonomous cleanup contract, if the user later chooses to schedule it, is defined in `CLEANUP_AUTOMATION_RUNBOOK.md`. The existence of that runbook does **not** itself enable or schedule automation.
