# Cloudflare Wave70

Version: **12.89.0-wave70**

## Shopping add UI / JavaScript
- Reworked `shopping-new.js` startup so initialization errors are reported with `data-shopping-new-js=error` and successful startup with `ready`.
- Replaced the wide `🔗 URL` control with a compact icon-only URL button.
- URL input opens as a constrained popover inside the product row/card instead of overflowing the form.
- `＋ 商品を追加` appends rows without focus or scroll movement.
- Uses `FormData` for common fields instead of named form-property access during submit.

## Calendar recurring single-day placement
- Recurring virtual occurrences now use the same explicit single-day top anchor as ordinary one-day tasks.
- Removed the physical-task-first sort bias for single-day calendar items; recurring occurrences participate in the same `sort_order`/id ordering.
- Existing multi-day stable lanes remain above single-day content.

## Event task kind
Introduced `tasks.task_kind='EVENT'` as a UI/behavior distinction only. No legacy `events` table is restored.

Event behavior:
- created/edited from normal task screens with “イベントとして登録”
- requires a date
- appears in calendar and Today/Tomorrow date views
- no completion checkbox
- cannot be completed through `/api/toggle`
- excluded from expired-task list and unorganized/no-date list
- excluded from home “未完了タスク” counters
- reminder, assignees, location, description, calendar color/visibility, multi-day span and linked shopping/items remain available
- calendar day detail identifies it with `📌` / `(イベント)`

Message -> new task conversion also supports the event flag.

## Lifecycle archive commonization
Added `src/lifecycle.ts` with shared completion archive statement builders for:
- task
- shopping
- item

The main task API delete path, legacy task delete path, and direct item/shopping edit delete paths now use shared archive logic for completion state. This also corrects old legacy-completion archive SQL to store literal `COMPLETED` rather than relying on a nonexistent `action` field in current completion tables.

## Diagnostics detail
Admin Data Diagnostics keeps the top-level counts and now provides read-only expandable samples (max 20) when a category has issues. Samples show technical IDs/status/date fields only; no mutation action is attached to the details.

## Browser script externalization
Moved task creation/edit browser controllers out of rendered TypeScript template strings:
- `public/assets/task-new.js`
- `public/assets/task-edit.js`

They are included in `npm run check:browser-js`.

## Validation
Passed:
- `npx --no-install tsc --noEmit`
- `npm run check:browser-js`
- local Python SQLite application of migrations 0001–0015
- EVENT task INSERT and UPDATE smoke test
- `PRAGMA foreign_key_check` clean in the smoke database

## Migration
No new D1 migration. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
