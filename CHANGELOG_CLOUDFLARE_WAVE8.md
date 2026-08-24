# Family TODO LINE - Cloudflare D1 Wave 8

## Calendar fidelity update

Wave 8 brings the Cloudflare calendar closer to the original v12.35 calendar implementation.

### Added
- Japanese national holiday labels in the calendar.
- Holiday styling for Sundays and national holidays.
- 2026+ movable holiday rules: Coming-of-Age Day, Marine Day, Respect-for-the-Aged Day, Sports Day, Vernal/Autumnal Equinox, citizen holiday and substitute holiday handling.
- Calendar display of normal tasks with `start_at` / `end_at` / `due_at`.
- Calendar display of recurring task occurrences.
- Calendar display of family events.
- Task/event indicators inside each date cell.
- Date detail panel showing holiday, task/event title, assignee, time and location.
- Detail modal when a date is tapped.
- Per-date task and event creation buttons.
- Floating task-add button.
- Preservation of the existing six-week mobile calendar layout.

### Preserved
- D1 schema and bindings.
- Existing LIFF authentication/session flow.
- Existing family creation/join flow.
- Existing recurring-task APIs.
- Existing task/event creation APIs.
- Existing bottom navigation.

### Files changed
- `src/app.ts`
- `public/assets/calendar.css`
