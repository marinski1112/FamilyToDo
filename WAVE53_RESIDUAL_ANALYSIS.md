# Wave53 residual analysis

## Fixed / materially improved in Wave53

1. **Task creation**: user confirmed working after Wave52.
2. **Calendar date geometry**: stale CSS cache key identified as an important reason later alignment fixes may not have reached iOS/LIFF. Cache key is now Wave53 and a stronger top-left rule was added.
3. **Shopping density**: list now prioritizes scanning rather than exposing every field and action inline.
4. **Shopping add flow**: list page uses a floating add button; the existing dedicated new-shopping page remains the entry form.
5. **Shopping filters**: moved behind a disclosure panel.
6. **Shopping details/actions**: moved to a modal sheet opened from the item name.
7. **Invitation UX**: friend-add/LINE-open instructions are now visible without inventing an unknown official-account URL.

## Still requiring runtime verification

- Calendar date numbers are actually top-left after the new asset query string reaches the device cache.
- Day-cell tap, month swipe, detail swipe and FAB behavior remain intact on the user's iPhone/LINE WebView.
- Shopping detail sheet works correctly inside LIFF Safari/WebView, including backdrop close and product links.
- Shopping completion still preserves scroll position.
- Expired list and active filters correctly interact with item details.
- Invitation link generation/join remains valid after the guidance-only UI change.

## Higher-priority remaining product residuals

### Calendar
- Verify multi-day bar continuity and row stability across 5/6-week months.
- Verify recurring task exception/day conversion UX.
- Verify completed recurring occurrences render strike-through consistently.
- Continue checking holiday substitute/citizens-holiday rules.

### Shopping / belongings
- Consider task-group view in addition to category/date view.
- Add explicit "clear filters" action if users begin using multiple filters often.
- Consider one shared detail sheet pattern for belongings as well.
- Continue lifecycle checks for overdue/completed/deleted child records.

### Family invitation / LINE
- Repository has no official LINE Basic ID or friend-add URL variable. When available, add an optional environment variable such as `LINE_OFFICIAL_ACCOUNT_URL` and render a real "友だち追加" button/QR link.
- Verify whether invite recipients who have not friended the OA can receive all intended push notifications under the current Messaging API setup.

### Auth / reliability
- Continue login-loop guard implementation/verification for destination-page failures.
- Continue structured request-id/error diagnostics for remaining 5xx responses.

## Guardrails

- Do not restore the legacy DB `events` concept.
- Do not rename/remove LINE Webhook `events[]`.
- Do not rewrite already-applied migrations.
- Keep SQL column/value/placeholder/bind counts mechanically checked.
