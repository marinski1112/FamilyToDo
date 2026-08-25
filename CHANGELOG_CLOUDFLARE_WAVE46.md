# Cloudflare D1 Wave46

## State-transition audit
- Completion toggles now require the actor to be a current active assignee when the entity has active assignees.
- Fixed task ANY-mode completion so it depends on an actual current-assignee completion rather than the actor merely sending a completion request.
- Added per-member operational completion snapshots for shopping items, matching task/item lifecycle semantics.
- Task/item/shopping assignment changes now remove operational completion snapshots belonging to removed assignees and recompute current status without deleting historical completion records.
- Recurrence rule assignment changes now clear stale task/occurrence operational completion snapshots for removed assignees and recompute occurrence status.
- Legacy task deletion route now archives task/item/shopping completion history before deleting live rows, matching the canonical deletion path.
- Task-edit child deletion now also archives legacy shopping completion snapshots before deletion.

## Policy
- Historical completion records are retained.
- Operational completion snapshots represent only the current active-assignee state.
- If an entity has no active assignees, its status remains pending until an assignee is assigned; this avoids treating an unassigned entity as completed by stale data.

## Verification
- TypeScript check: `npx --no-install tsc --noEmit` passed.
