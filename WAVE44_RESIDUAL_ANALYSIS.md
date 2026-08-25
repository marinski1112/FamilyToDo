# Wave44 residual analysis

## Findings fixed
1. The alternate `/api/task` DELETE route bypassed the Wave43 archive table and directly deleted completion history.
2. The `/task/delete.php` route had the same lifecycle gap for child and task completion history.
3. The alternate recurrence deletion path removed occurrence completion rows without archiving them.
4. Message deletion still hard-deleted pending/retry notifications, contrary to the notification lifecycle policy.
5. A deleted member could be silently reactivated by the family join flow using the same LINE identity.
6. Deleted members could remain selectable in notification-recipient administration.
7. `package.json` and `source_inventory.json` had stale wave metadata.

## Policy now enforced
- Operational task/item/shopping/recurrence records may be deleted.
- Completion history survives deletion in `deleted_completion_history`.
- Pending/retry notifications are cancelled rather than hard-deleted.
- Members are tombstoned and are not silently resurrected.
- Deleted members are excluded from new operational assignments/notification settings.

## Remaining
- Archived completion history does not yet have a dedicated administration/report UI.
- Full smartphone visual QA still requires actual device/browser execution; source-level responsive review can continue.
- Family-level destructive deletion and retention policy should be specified before implementing any family deletion feature.
- Notification delivery history remains intentionally separate from completion history; sent notifications are not treated as business-history records.
