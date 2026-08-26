# Wave64 / 12.83.0-wave64

## Calendar density/layout fix
- Fixed the hard cap that rendered only the first two single-day tasks in a month cell.
- Month cells now render up to four single-day tasks; additional tasks show `+N件` and remain available in day detail.
- Increased visible multi-day stable lanes from 3 to 4 before overflow counting.
- Replaced fixed calendar-week height with a per-week dynamic height derived from:
  - visible multi-day band rows
  - visible single-day task rows
  - carry-item/shopping indicator rows
- Reserved a dedicated date-number zone above multi-day bands so bands no longer collide with the date number/today circle.
- Removed the fixed `max-height:21px` behavior that clipped single-day task rows after Wave61.
- CSS/JS cache version updated to Wave64.

## Compatibility
- Task-only calendar architecture retained.
- Day detail, swipe, reorder, multi-day band links and async month navigation are unchanged.
- No D1 migration.
