# Wave36 analysis

## Fixed in this wave
1. Calendar cell taps: delegated touch/pointer/click handling so generated cells remain interactive.
2. Empty-day detail: every calendar cell is a button with a date and opens the detail modal.
3. Detail modal: add button, previous/next day, and horizontal swipe retained and hardened.
4. Calendar month swipe: single touch handler with vertical-scroll discrimination and tap-after-swipe suppression.
5. Calendar FAB: fixed above bottom navigation and direct task creation target.
6. Calendar date number: explicit top-left CSS.

## Lifecycle checks continued
- Task completion/reopen cancels pending/retry notifications only when the task is actually completed.
- Wave34 notification lifecycle remains active.
- Task-only model retained; legacy event entities are not restored.
- Shopping remains attachable to tasks and expandable from daily task cards.

## Not changed in this wave
- No new migration.
- No changes to notification scheduling semantics.
- No reintroduction of the removed Event concept.
