# Migration Progress — Wave10

## v12.35 parity targets addressed

| Area | Wave10 status |
|---|---|
| Top page / LIFF session handling | Session-first; missing session falls back to LIFF entry |
| Bottom navigation | Shared layout extended to task/item add pages |
| Daily task checkboxes | Existing behavior retained and CSRF-normalized |
| Daily item checkboxes | Existing behavior retained |
| Daily shopping | Added list, completion checkbox and add action |
| Calendar 7-column grid | Fixed at CSS/layout level |
| Calendar holidays | Existing holiday calculation retained |
| Calendar tasks/events | Existing month data retained |
| Calendar shopping | Added dated shopping display |
| Calendar detail completion | Task + shopping completion added |
| Calendar registration | Event/task/item/shopping/message links restored |
| Calendar month swipe | Added |
| Shopping add | Quantity/category/due date/task/memo restored |
| Shopping completion | Existing D1 completion-history model retained |
| Task/item add pages | Shared bottom navigation + CSRF |

## Important
This wave deliberately does not add a new migration. Existing D1 tables/columns are reused.

The next parity pass should compare each page against the v12.35 source screenshots/markup and refine spacing, card count, typography, button placement, and the remaining task/event/detail behaviors.
