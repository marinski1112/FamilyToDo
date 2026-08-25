# Cloudflare D1 Wave42

## Focus
- Data lifecycle audit: member deletion
- Preserve historical completion/assignment/activity records
- Mobile member-management action sizing

## Changes
- Added `members.deleted_at` tombstone column and lifecycle index.
- Replaced physical member DELETE with logical deletion (`active=0`, notifications disabled/cancelled, `deleted_at` set).
- Prevented deleted members from being reactivated through the normal toggle action.
- Kept historical member IDs intact so completion history, assignee history and activity logs remain queryable.
- Mobile member action buttons use a minimum 42px touch target and stack responsively.

## Intentionally unchanged
- Event concept remains removed; calendar continues to use tasks/recurring tasks.
