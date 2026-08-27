# Wave75 residual analysis

## Production validation priority
1. Apply migrations 0016 and 0017 before/with Worker deployment.
2. Open `/app/family_log.php`.
3. Add a subject such as a child profile.
4. Add each quick log type and confirm timeline rendering.
5. Edit and delete a log.
6. Start/stop sleep and breastfeeding timers.
7. Link a family log to a normal task/event.
8. Link a family log to a recurring occurrence for the selected date.
9. Confirm bottom navigation has six items and the Family Log slot works in LINE WebView.
10. Confirm old Today/Tomorrow compatibility URLs continue to work.

## LIFF / rich-menu validation point
Family Log now reads and writes real D1 data, so this is the first Wave where the user's sixth LIFF/rich-menu slot can be changed to Family Log for real-device testing.

Recommended Worker LIFF entry path:
`/liff?next=%2Fapp%2Ffamily_log.php`

The existing LIFF ID does not need to be replaced merely to add this page; only the rich-menu/navigation destination needs to point at the Family Log entry path.

## Family Log next features
- subject edit/deactivate/reorder
- graphs and weekly/monthly trends
- configurable custom log types
- left/right breastfeeding detail with per-side duration
- richer medicine fields and dosage history
- task completion from a linked log where explicitly requested
- recurring-task -> family-log automatic template/action linkage
- PDF/CSV export
- PWA offline-safe draft capture (do not cache authenticated HTML)

## PWA/Web Push next features
- device labels for multiple subscriptions
- optional LINE + Web Push dual delivery only with explicit deduplication semantics
- delivery-attempt history if push debugging is needed

## Technical debt
- add family-log cross-family link checks to the diagnostics page
- consider separating family-log server/UI code from `src/app.ts` once the MVP stabilizes
- continue consolidating lifecycle/archive helpers
- keep old Today/Tomorrow routes as compatibility paths until usage is proven unnecessary
