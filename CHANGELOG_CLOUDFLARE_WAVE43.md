# Cloudflare D1 Wave43

## Deleted-data lifecycle
- Added `deleted_completion_history`, a no-FK archive for completion records whose live task/item/shopping/recurrence occurrence is deleted.
- Task deletion now archives task completion history and legacy task completion rows before deleting the live task.
- Child shopping/item deletion during task editing/deletion archives completion history before deletion.
- Direct item/shopping deletion archives their structured completion history.
- Recurrence-rule deletion archives per-occurrence completion rows before removing occurrence data.
- Existing notification cancellation and activity logging behavior is retained.

## Policy
Operational records may be deleted; completion history is retained in the archive. Notifications are ephemeral and are cancelled rather than treated as historical records.
