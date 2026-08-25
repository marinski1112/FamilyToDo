# Wave40 residual analysis

## Fixed
- Monthly business-day recurrence now skips Japanese holidays, matching the XREA source.
- Added compatibility aliases for legacy family/login/LIFF diagnostic routes.
- Hardened family creation ID retrieval for D1.

## Remaining verification targets
- Physical LINE WebView testing of calendar empty-cell taps and FAB navigation.
- Cross-month swipe at month boundaries.
- Completion propagation for multi-assignee ALL tasks and recurring occurrences.
- Shopping/item lifecycle when a parent task is completed, reopened, edited, or deleted.
- Notification cancellation/rescheduling across task/message/member setting changes.
- Full visual parity against v12.35 forms.
- End-to-end LINE webhook and scheduled notification testing with staging credentials.
