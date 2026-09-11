# Rough input / calendar entry cleanup

This bounded change migrates Task/Event creation off the obsolete `public/assets/task-new.js` controller while preserving the legacy-compatible `/task/new.php` URL.

Key contracts:

- AI rough input is the canonical entry workflow.
- Explicit EVENT input normalizes a date-only line immediately followed by a title into one semantic event block.
- Manual Task/Event entry derives its type from the same explicit type selector; EVENT omits assignee, completion, event-toggle, and no-deadline controls; TASK has no redundant event-toggle.
- Calendar color values remain unchanged. Visible `TimeTree` suffixes are removed, a swatch is shown, and the last create-time color is remembered without overriding saved edit colors.
- Shopping and Item specialized manual entry paths remain unchanged.
