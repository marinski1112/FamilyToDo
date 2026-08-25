# Wave42 residual analysis

## Fixed
- Physical member deletion could cascade/delete historical rows because assignee and completion-history tables reference members with `ON DELETE CASCADE`.
- Member notification cancellation did not consistently scope `family_id`.
- Deleted members had no durable lifecycle state.

## Remaining high-priority audit items
1. Task/recurring-task deletion versus historical activity retention.
2. Child shopping/item deletion and whether history should remain after parent deletion.
3. Message deletion versus notification/activity retention.
4. Family deletion cascade behavior.
5. Invitation consumption/revocation lifecycle.
6. Notification retry/sent/cancelled transitions under edit/delete/disable.
7. Mobile form ergonomics across task, shopping, item, message and recurring-task screens.
