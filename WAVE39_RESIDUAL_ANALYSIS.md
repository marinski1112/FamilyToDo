# Wave39 residual analysis

## Fixed
1. Notification OFF now has an immediate lifecycle effect instead of waiting for cron cleanup.
2. Admin notification OFF changes cancel pending/retry notifications for affected members.
3. Legacy task deletion now removes dependent shopping/item assignment and completion-history records.
4. Calendar task-add FAB has a valid initial href and updates to the selected day without relying on a stale first click.

## Next priority
- Reopen-before-reminder: decide whether a future reminder should be recreated after a task is reopened.
- Recurring task reminder semantics: keep reminder configuration per occurrence rather than treating the template timestamp as a single global notification.
- Notification deduplication and idempotency under repeated edits/retries.
- Member deletion/stop semantics for historical activity and completion records.
- Calendar interaction regression in LINE WebView: tap empty day, modal plus, previous/next day, swipe day, swipe month.
- Shopping lifecycle when linked task date changes or task is deleted.
- Remaining old event-era references and UI consistency.
