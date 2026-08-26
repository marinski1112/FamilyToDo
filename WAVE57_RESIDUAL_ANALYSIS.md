# Wave57 residual analysis

## Verified / addressed in this wave

1. Recurring task delete succeeded but fallback redirect displayed "定期タスクを保存しました。"
   - Cause: all HTML POST actions shared `?saved=1`.
   - Wave57: action-specific `result=saved|deleted|toggled`.

2. Recurring creation screen still displayed fields irrelevant to the selected recurrence rule.
   - Wave56 used the DOM `hidden` property, but the reported LINE WebView continued showing fields.
   - Wave57 uses explicit inline initial state and explicit `style.display` switching.
   - The generic interval field was also removed from monthly recurrence types where it was not semantically needed.

3. Task-add screen looked broken when "終日" was disabled.
   - The screen mixed date-only controls with two wide `datetime-local` controls.
   - Wave57 keeps dates in the date row and reveals only start/end `time` controls, with responsive stacking on narrow screens.
   - Server-side normalization now applies end time to the selected end date for timed multi-day tasks.

4. Consistency
   - Task edit and message-to-task new-task forms now hide time controls for all-day entries and hide calendar color when calendar display is off.

## Next high-priority review

- Recurrence occurrence lifecycle: exception/convert-one-occurrence behavior, edit propagation, notification regeneration/cancellation.
- End-to-end recurrence delete: confirm occurrences, completion records, child shopping/items, task template, and notifications all disappear/cancel as intended.
- Calendar multi-day bar layout and recurrence occurrence detail navigation.
- Full SQL placeholder/bind-count audit across `src/app.ts` and `src/index.ts`, with emphasis on complex conditional SQL.
- Task create/edit parity: validation, no-date behavior, reminders, child item/shopping lifecycle and rollback.
- Message edit UI: replace prompt-based edit with modal form and consistent validation.
- Shopping/item list mobile density and edit/detail consistency.
- Invitation lifecycle: revoke/expire UI and official-account add flow verification.
- Login loop/error-page fallback and observability diagnostics.
