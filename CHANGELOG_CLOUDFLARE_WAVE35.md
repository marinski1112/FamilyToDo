# Family TODO LINE - Cloudflare D1 Wave35

## Fixes
- Fixed a fatal D1 SQL syntax error in the Today/Tomorrow shared query (`GROUP_CONCAT(...) AS assignees, FROM tasks`).
- Fixed calendar day-detail JavaScript referencing undefined `modalShoppingAdd` / `modalItemAdd` variables. This prevented the day modal from opening when a calendar date was tapped.
- Restored a clearly visible task-add `+` button inside the calendar day-detail modal. It creates a task for the selected date and keeps the shared bottom navigation unchanged.
- Kept holiday names out of the month grid; they remain visible in the selected-day detail.
- Kept calendar month swipe and selected-day previous/next navigation.
- Kept mobile date/datetime width normalization from prior waves.
