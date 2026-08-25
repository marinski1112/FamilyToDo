# Cloudflare D1 Wave44

## Lifecycle consistency audit
- Audited every application-level task deletion path and aligned alternate `/api/task` and `/task/delete.php` routes with the Wave43 completion-history archive policy.
- Archived task, item, shopping, legacy completion, and recurrence-occurrence completion rows before deleting live operational records.
- Archived recurrence occurrence completion rows before recurrence rules/occurrences are deleted through the remaining alternate path.

## Notification lifecycle
- Replaced remaining hard-deletes of pending/retry message and task notifications with `cancelled` updates.
- Kept notification cancellation scoped by family/member/target where applicable.
- This makes notification lifecycle behavior consistent with Wave34/Wave43: pending work is cancelled, not silently erased.

## Member lifecycle
- Prevented a deleted member from being silently resurrected by joining the same family again with the same LINE identity.
- Excluded tombstoned members from operational notification-recipient selection.
- Existing deleted-member history remains available in member administration.

## Metadata
- Updated package version to `0.1.0-wave44`.
- Refreshed source inventory wave/table metadata.
