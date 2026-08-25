# Cloudflare D1 Wave45

## State-transition audit
- Fixed the operational completion snapshot tables so `(entity_id, member_id)` is unique, matching the application's `ON CONFLICT` upsert semantics.
- Added migration 0014 which deduplicates legacy completion snapshots before creating unique indexes.
- Completion counts for task/item/recurrence ALL mode now count only completion snapshots belonging to current active assignees.
- Calendar/task detail recurrence completion calculation now uses the same active-assignee rule.
- When a member is stopped or tombstoned, their operational assignments and completion snapshots are removed from live state while the historical completion tables remain intact.
- When linked shopping children are removed during task editing, legacy shopping completion snapshots are now archived before deletion as well.

## Lifecycle policy
- Historical completion records remain in `*_completion_history` / `deleted_completion_history`.
- Operational completion snapshots represent only the current assignment state.
- Stopping/deleting a member therefore does not erase history, but prevents the former member from keeping a task/item completed through stale operational state.

## Verification
- TypeScript check: `npx --no-install tsc --noEmit` passed.
