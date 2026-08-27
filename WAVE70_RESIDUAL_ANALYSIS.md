# Wave70 residual analysis

## Production checks
1. Shopping add page:
   - URL button is compact and remains inside the card.
   - URL popover opens/closes.
   - Add product works repeatedly.
   - Adding a row does not move focus or scroll.
   - batch submit persists quantity/category/deadline/task/assignees/memo/URLs.
2. Calendar:
   - recurring one-day entries begin at the same first available row as ordinary single-day tasks.
   - multi-day bands remain above them.
   - date tap, day swipe, month swipe, reorder remain working.
3. Event:
   - create a birthday/vacation as Event.
   - calendar shows it.
   - Today/Tomorrow shows it without a checkbox.
   - it never enters expired-task list after its date passes.
   - task detail has no completion control.
   - reminder still remains eligible.
4. Data diagnostics:
   - issue counts can expand to a max-20 read-only technical sample.
5. Delete/archive:
   - task/item/shopping deletions preserve completion history in `deleted_completion_history`.

## Event semantics still worth deciding later
- Whether events should be shown in a separate “イベント” section on Today/Tomorrow or remain mixed chronologically with tasks. Wave70 keeps them mixed.
- Whether event-linked shopping should become overdue based on the event date. Wave70 leaves shopping lifecycle unchanged, because a shopping item may still legitimately have a deadline even when its parent is an event.
- Whether recurring events are needed. Wave70 intentionally does not add event semantics to recurrence rules yet.

## Remaining technical debt
- `taskView()` still contains a large interactive inline script; move it to a static JS asset next.
- Today/Tomorrow still contain inline toggle/modal JavaScript; externalize after task detail.
- Continue converting remaining delete paths to `src/lifecycle.ts` shared archive helpers.
- Calendar CSS contains historical override layers; consolidate only after current production layout remains stable.
- Diagnostics currently shows samples but does not offer automatic repair for ambiguous cases; keep it read-only unless repair semantics are provably safe.
