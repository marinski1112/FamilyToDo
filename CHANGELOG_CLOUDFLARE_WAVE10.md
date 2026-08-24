# Family TODO LINE v12.35 Cloudflare D1 Wave10

## Purpose
Wave10 continues the v12.35 migration by restoring cross-page behavior and the original calendar/registration model instead of treating each page as an isolated screen.

## Updated
- `src/app.ts`
  - Home is session-first. If the Worker session is absent, `/` and `/app/index.php` go through `/liff?next=/app/index.php` instead of sending the user to a second LINE login/token verification path.
  - Daily pages now expose a shopping section with direct completion checkboxes and add links.
  - Recurring task checkboxes use occurrence IDs and update `recurrence_occurrences` rather than trying to update a negative task ID.
  - Calendar now queries dated shopping items and exposes them in the month cells and selected-day detail.
  - Calendar selected-day detail supports task completion and shopping completion directly.
  - Calendar includes the original-style `＋ 登録` area for event/task/item/shopping/message creation.
  - Calendar supports horizontal swipe for previous/next month.
  - Shopping page restores category, due date, memo, related task, quantity and completion behavior.
  - Shopping category is free-input with datalist suggestions.
  - Shopping completion remains backed by the existing D1 completion-history schema.
  - `layout()` is exported for shared use by standalone add pages.
- `src/index.ts`
  - Task/item add pages now use the shared six-item bottom navigation.
  - Task/item creation requests include CSRF tokens.
  - Task/item APIs validate CSRF.
  - Unauthenticated task/item add pages return to the LIFF entry flow rather than a second login page.
- `public/assets/calendar.css`
  - Forces the current Worker calendar into a real seven-column month grid.
- `public/assets/family.css`
  - Adds cross-page styles for shopping rows, calendar completion controls and registration/detail areas.

## Database
No migration is added. Wave10 uses the existing D1 schema, including `shopping_items.task_id` and `shopping_completion_history`.

## Validation
- TypeScript: `tsc --noEmit --skipLibCheck` passes.
