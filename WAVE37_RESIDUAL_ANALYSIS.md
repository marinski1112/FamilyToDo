# Wave37 residual analysis

## Fixed
1. Daily page D1 query was made less parser-sensitive by replacing the task/member GROUP BY query with a correlated assignee aggregation.
2. Ordinary daily task query now excludes recurrence templates; recurrence occurrences are still rendered by `recurringForDate()`.
3. Calendar date tap is delegated from the grid and works for empty dates.
4. Calendar horizontal swipe and date-detail horizontal swipe remain separate interactions.
5. Calendar cells reset native button appearance and keep the day number top-left.

## Still to verify after deployment
- iOS/LINE WebView physical tap behavior on empty calendar cells.
- Cross-month swipe at month boundaries.
- Completion state propagation for multi-assignee ALL tasks.
- Shopping/item lifecycle when a parent task is completed, reopened, edited, or deleted.
- Notification cancellation/rescheduling when task/message reminder settings change.
- Remaining legacy event columns in historical schema versus application references.
- Responsive consistency across task, shopping, message, settings forms.
