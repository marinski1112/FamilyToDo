# Cloudflare D1 Wave47

## Bug-fix / state-transition audit
- Fixed a lifecycle contradiction where an unassigned task could still become completed because the actor was allowed to create a completion snapshot when no active assignees existed.
- Completion is now rejected for unassigned tasks, items, shopping items, and recurring occurrences. The operational status therefore remains pending until an active assignee exists.
- Added the same current-assignee authorization check to recurring-task occurrence completion. Previously the recurrence branch lacked the actor-assignee check entirely.
- Tightened ANY/ALL completion predicates so completion requires at least one active assignee before the entity can become completed.
- Kept historical completion records untouched; this wave only prevents invalid operational completion writes.

## Verification
- TypeScript check: `npx --no-install tsc --noEmit` passed.
