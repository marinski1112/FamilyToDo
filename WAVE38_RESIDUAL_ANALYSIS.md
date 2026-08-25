# Wave38 residual analysis

## Fixed
1. Inactive family members could remain in ALL completion counts and block tasks/items forever.
2. Shopping/item deletion could leave dependent assignee/history rows.
3. Removing child rows from task editing could leave dependent rows.
4. Task creation did not expose a multi-day all-day end date even though the calendar model supports end_at.
5. Task editing needed an explicit end-date field for multi-day tasks.
6. Mobile date/datetime/url fields received hard width constraints to prevent overflow.
7. Calendar day numbers receive an explicit top-left layout rule.

## Still to inspect next
- Recurring-task occurrence reminder lifecycle versus template reminder semantics.
- Shopping completion/assignment lifecycle when a linked task is completed or deleted.
- Member deletion versus historical activity preservation.
- Notification deduplication after repeated task edits.
- Calendar swipe/tap interaction regression testing on LINE WebView/iOS Safari.
- Remaining page-by-page UI consistency and old event-era code references.
