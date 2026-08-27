# Wave77 residual analysis

## Production QA priority
1. Apply migration 0018 before deploying the Worker.
2. Open Family Log and confirm all active Family TODO members appear as switchable subjects.
3. Select the existing baby subject:
   - if it already has a milk/diaper record, it should show as BABY automatically after migration.
4. Open `対象設定`.
5. Turn Breastfeeding OFF.
6. Return to Family Log:
   - Breastfeeding quick button must be gone.
   - Breastfeeding timer start must be gone.
   - Milk and other enabled items must remain.
7. Re-enable Breastfeeding and confirm it returns.
8. Record diaper:
   - pee
   - poop
   - both
   Baby summary should count BOTH in each respective total.
9. Record Bath / Shower.
10. Switch between each family member and confirm timelines are filtered independently.
11. Confirm `すべて` shows the combined family timeline.
12. Add a standalone baby/pet subject and confirm it can be hidden later.

## Data model notes
- `family_log_subjects.member_id` remains the bridge to actual Family TODO members.
- `subject_kind` is now also the UI profile mode.
- `enabled_types_json` stores subject-specific quick-entry visibility.
- Actual `family_logs.log_type` values are not removed when an item is disabled.
- This preserves historical records and allows re-enabling later.

## Safe compatibility
- Legacy DB `events` remains removed.
- Family Log stays a separate chronological domain.
- No changes to tasks/event storage semantics.
- Existing Family Log rows require no rewrite.
- Only existing CHILD subjects with baby-care logs are promoted to BABY.

## Next priorities
- Breastfeeding left/right independent timers and totals.
- Structured medicine name / dose / unit.
- Week/month Family Log charts.
- Subject ordering and optional avatar/icon editing.
- Better recurring-task -> Family Log one-tap completion/log creation.
- Web Push device diagnostics and delivery lifecycle.
