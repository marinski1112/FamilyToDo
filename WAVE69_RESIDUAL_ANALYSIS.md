# Wave69 residual analysis

## Production checks
1. Shopping add:
   - each row initially shows product name, quantity, and a small URL button
   - URL field appears only after tapping `🔗 URL`
   - URL popover closes with × or by tapping outside
   - tapping `＋ 商品を追加` does not move focus or intentionally scroll to the new row
   - several rows can be added first, then filled in
2. Notification settings still save correctly after static-JS extraction.
3. Management -> Data diagnostics opens for OWNER/ADMIN and shows zero counts on a clean dataset.
4. Existing calendar, recurring, message, invite, and member-management behavior should remain unchanged.

## Next priorities
- Continue static-JS extraction for remaining interactive settings/content flows where it materially reduces template-script risk.
- Consolidate entity deletion/archive logic into shared helpers after verifying every current delete path has identical archival semantics.
- Add drill-down details to diagnostics only where safe; counts are intentionally read-only in Wave69.
- Continue recurrence lineage/excluded-date UX refinement.
- Consolidate calendar CSS only after the current layout remains stable across several production waves.
