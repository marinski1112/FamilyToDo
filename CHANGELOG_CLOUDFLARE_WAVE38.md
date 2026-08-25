# Family TODO LINE Cloudflare Wave38

- Lifecycle: task/item ALL completion now counts only active members, so deactivated members no longer block completion.
- Lifecycle: deleting shopping/items cleans assignees and completion history before removing the row.
- Lifecycle: removing shopping/items from a task edit also cleans their dependent rows.
- Task dates: task creation now supports multi-day all-day tasks with start/end dates.
- Task dates: task editing now preserves/edits an end date for multi-day tasks.
- Mobile UI: date/datetime/url inputs are constrained to their containers and single-column on narrow screens.
- Calendar: day number is explicitly top-left aligned.
- Cache/version: family.css and calendar.css bumped to 12.57-wave38.
- No D1 migration added.
- Deploy remains `npm run deploy`.
