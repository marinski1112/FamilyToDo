# Cloudflare Wave73

Version: **12.92.0-wave73**

## Task/Event consolidation
- Added `/app/tasks.php` as the new primary daily page.
- User-facing name is **タスク・イベント**.
- The page is date-based rather than maintaining separate Today and Tomorrow implementations.
- Quick chips jump to Today / Tomorrow; previous/next buttons move one day at a time.
- Task, recurring occurrence, EVENT, linked shopping, linked carry-item, unorganized tasks, and expired tasks continue to use the existing daily rendering and completion controller.
- EVENT rows remain non-completable and are not included in expired/unorganized task semantics.

## Navigation
- Primary bottom navigation now temporarily uses five entries:
  1. タスク・イベント
  2. カレンダー
  3. 買い物
  4. 伝言
  5. 管理
- The sixth slot is intentionally left for the planned family-log module.
- Home menu merges the former Today/Tomorrow cards into one full-width Task/Event card.
- Home counts include recurring occurrences and multi-day physical tasks for the selected day, while EVENT counts remain separate.
- `/today.php` and `/tomorrow.php` remain available as compatibility routes; they are not deleted or redirected yet.

## Return-path consistency
- New task/event creation returns to `/app/tasks.php` by default.
- Item creation/edit returns to the unified Task/Event page.
- Task detail returns to the unified page for the selected date.
- Normal task delete returns to the unified page.
- Calendar-origin task creation still returns to the calendar when `return=calendar` is supplied.

## Terminology
- Task add/edit entry points use “タスク・イベント”.
- Message conversion UI now refers to “タスク・イベント” because the new-task path can create either TASK or EVENT.

## Validation
- `npx --no-install tsc --noEmit` passed.
- `npm run check:browser-js` passed.
- No D1 migration added.
- Latest migration remains `0015_wave52_remove_legacy_event_fk.sql`.
