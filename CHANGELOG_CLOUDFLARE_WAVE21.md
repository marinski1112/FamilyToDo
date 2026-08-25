# FamilyTODO Cloudflare D1 Wave21

## v12.35 residual parity / bugfix
- Native HTML form POSTs now work on Worker endpoints that previously expected JSON only (`application/x-www-form-urlencoded` and `multipart/form-data` are parsed, including repeated fields).
- Fixed settings notification save path and form-based item/event editing compatibility.
- Today/Tomorrow now restore the original expired-task modal/list behavior.
- Today/Tomorrow task rows now expose linked shopping and item children, including recurring template children.
- Shopping page gains category/date view, category/due/assignee filters, expired-shopping modal, and shopping-to-task conversion.
- Shopping conversion preserves shopping assignees on the created task.
- Task and recurring-task calendar colors are supported using the original v12.35 palette.
- Recurring tasks now support assignees plus linked shopping/items, including edit-time replacement.
- Calendar task bars use the selected task calendar color.
- Shared CSS cache version bumped to `12.45-wave21`.

## Validation
- `tsc --noEmit`: PASS
- No new D1 migration required.
- D1 schema already contains `tasks.calendar_color`, `shopping_categories`, child relationship tables, and recurrence tables needed by this wave.
