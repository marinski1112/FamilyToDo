# Family TODO LINE Cloudflare Wave62

Version: `12.81.0-wave62`

## Calendar
- Added touch-safe task reordering in the day-detail sheet.
- Reorder mode uses explicit ↑ / ↓ controls rather than desktop-only HTML5 drag/drop.
- Reorder API now validates that every supplied task belongs to the current family and de-duplicates IDs.
- Reorder writes stable `sort_order` values in increments of 10.

## Recurring occurrence exception lifecycle
- Fixed `/task/convert_occurrence.php` to accept normal HTML form POST as well as JSON. Previously the page submitted form data while the handler attempted `request.json()` only.
- Fixed a latent D1 parameter-binding mismatch in the exception-task INSERT.
- Preserve calendar color, assignees and existing occurrence completion records when converting one recurrence occurrence into a normal task.
- Clone recurring-template shopping/items into the one-off task so editing the exception does not detach the shared series template.
- Cloned shopping/item assignees are preserved.

## Shopping schema bug fix
- Removed invalid `shopping_items.group_key` references from Worker SQL.
- Current D1 schema has `group_key` on `items`, not on `shopping_items`.
- Fixed affected task-with-shopping, task-edit child shopping, recurring-task child shopping, exception cloning and DB runtime/schema health SQL paths.

## Messages
- Replaced prompt-based message editing with a proper mobile sheet.
- Edit sheet supports recipient, message text and LINE reminder datetime.

## Invitations
- Added issued-invitation history to Family Members settings.
- Displays active / used / expired-or-revoked state.
- Added revoke for unused active invitations.
- New invitation expiry timestamps are generated consistently in Asia/Tokyo time.

## Validation
- `npx --no-install tsc --noEmit` passes.
- Local SQLite migration set 0001-0015 was applied and a recurrence-occurrence conversion test preserved task/assignee/completion and cloned linked shopping/items with `PRAGMA foreign_key_check` returning no rows.
- No new D1 migration is required.
