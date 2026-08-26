# Wave67 residual analysis

## Production checks
1. In a week containing a multi-day task, open a different date that has no multi-day task.
   - Its ordinary task should start directly below the date number, not below the other day's band lanes.
2. Create/edit a recurring task with `カレンダーに表示` OFF.
   - Month grid: recurrence should not appear.
   - Tap that date: recurrence should appear in day detail as `定期・月非表示`.
3. Exclude an occurrence, then open recurring management.
   - It should appear under `除外した発生日`.
   - `復活する` should make it recur again.
4. Split a recurring series with `指定日以降だけ変更`.
   - Old row should show the next-series label.
   - New row should show the split-origin label.
5. Run scheduled notifications and watch for `[Family TODO LINE] lifecycle audit` warnings.

## Important remaining lifecycle work
- For excluded occurrences outside a rule after later series edits/splits, decide whether to preserve them only as history or expose them in an archived-exclusions view.
- Add a clearer series-history/detail screen if split chains become long; current lineage badges are intentionally compact.
- Continue orphan audits for task-linked shopping/items and deleted-completion archives.
- Confirm notification cleanup and retry behavior with real failed sends, not only schema smoke tests.

## Browser-script technical debt
Externalized:
- calendar controller
- recurring-task controller

Still large inline controllers:
- messages
- settings/member/invite flows
- today/tomorrow completion interactions

Move the largest/highest-risk ones to static JS incrementally, with Node syntax checks, rather than a single broad rewrite.

## Calendar CSS technical debt
The calendar is functionally stable but still contains old XREA selectors plus later Worker/Wave overrides. Do not aggressively consolidate until the per-date lane change is verified on iPhone/LINE WebView.
