# Cloudflare D1 Wave53

Version: `12.72.0-wave53`

## Confirmed runtime improvement

After Wave52, the user confirmed that normal task creation succeeds. This verifies that the stale `events` foreign-key failure blocking task registration has been removed from the active path.

## UI changes

### Calendar
- Bumped `family.css` and `calendar.css` cache-busting query strings to Wave53. The Worker had continued to reference the old `12.58-wave39` cache key even though later CSS fixes were appended.
- Added a final iOS/LIFF rule that makes every `.calendar-cell` an explicit two-row grid and pins `.num` to the top-left.
- Existing month grid, FAB, day-detail modal, holiday coloring and task color behavior are preserved.

### Shopping
- Replaced the large inline add form on `/app/shopping.php` with a bottom-right `+` FAB linking to `/app/shopping_new.php`.
- Changed filters to a collapsible `<details>` panel. It stays closed by default and opens automatically when a non-default filter is active.
- Simplified each shopping row to checkbox + item name + quantity only.
- Item name opens a detail bottom sheet instead of immediately navigating to edit.
- Detail sheet shows category, due date, linked task, assignees, memo and product URL only when present.
- Edit and task-conversion actions were moved into the detail sheet.
- Expired items also open the same detail sheet.
- Completion toggle remains inline without forcing page navigation.

### Family invitation
- Added visible guidance explaining that invitees should add the Family TODO LINE official LINE account, open the invite link inside LINE, then join the family.
- Added the same guidance to the invite landing page.
- No official-account URL was fabricated because the repository currently contains no Basic ID/friend-add URL setting. A real direct friend-add button should be added only after that value is configured.

## Database

No new migration in Wave53.
`0015_wave52_remove_legacy_event_fk.sql` remains the latest migration.

## Files changed
- `package.json`
- `source_inventory.json`
- `src/app.ts`
- `public/assets/calendar.css`
- `public/assets/family.css`
- `CHANGELOG_CLOUDFLARE_WAVE53.md`
- `WAVE53_RESIDUAL_ANALYSIS.md`

## Validation
- `npx --no-install tsc --noEmit` passes.
