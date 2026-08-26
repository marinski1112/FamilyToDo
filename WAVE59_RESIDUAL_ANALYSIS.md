# Wave59 residual analysis

## Calendar parity restored in this wave
The former XREA/PHP calendar had several interaction details that were only partially present in the Worker implementation. Wave59 restores the most important mobile behavior without reintroducing the legacy `events` model. Calendar entries remain task/recurrence based.

Implemented:
- tapping any calendar date opens the day detail, including empty days;
- task detail links and completion checkboxes remain available in day detail;
- the day-detail + button creates a task for the selected date;
- after task creation from calendar, the same calendar date is reopened;
- left/right day navigation works by buttons and horizontal swipe;
- day navigation can cross the current loaded grid and loads the appropriate month;
- calendar horizontal swipe and month arrows update the month in place, with normal navigation as a failure fallback;
- current month state, previous/next month links, history URL and calendar data are kept synchronized after in-place navigation.

## Still to review
- Stable multi-day lanes/bands: the current Worker repeats task segments in each date cell, while the XREA implementation used stable week lanes spanning columns. This is the next high-value calendar visual parity item.
- Drag/reorder existed in the XREA day detail. The Worker already has `/app/api/reorder.php`, but mobile-friendly reorder UI has not yet been restored. Prefer explicit accessible move controls or a robust touch reorder implementation rather than desktop-only HTML drag.
- Recurrence exception lifecycle: converting one occurrence to a normal task exists, but edit/delete/completion propagation and linked shopping/items should be audited end-to-end.
- SQL placeholder/bind static audit still needs a proper parser-aware pass; simplistic regex counting produces false positives because bind arguments contain nested function calls/commas.
- Continue mobile density/alignment audits across settings, items, messages, task detail/edit and invitation lifecycle.
