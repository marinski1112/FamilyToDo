# Wave65 residual analysis

## Calendar
- Production QA is required for dense weeks containing: today marker, multi-day band, 4+ single-day tasks, shopping count, and items in the same week.
- Verify Sunday/Monday and month-boundary multi-day bands after the hard-pinned date-number change.
- If very dense weeks become too tall, next UX option is a per-day `+N件` detail affordance rather than reducing date-number space.
- Calendar CSS still contains historical XREA and Worker override layers. Consolidate only after Wave65 layout is confirmed stable.

## Recurring lifecycle
- Exception-task deletion semantics are still unresolved. Prefer an explicit user choice rather than silently restoring or permanently excluding the recurrence date.
- Future-only vs whole-series edit semantics remain.
- Exception-date notification scheduling/cleanup needs an end-to-end audit.

## Messages / shopping
- Message -> shopping prompt is removed in Wave65.
- Production QA should verify optional task link and assignee persistence.
- Define lifecycle if a converted shopping/task target is later deleted.

## Notifications / data lifecycle
- Continue audit for stale pending/retry notifications after edit/delete/reschedule.
- Continue orphan-data checks for recurrence occurrences, exception tasks, completions, shopping/items, and deleted members.

## Technical debt
- Continue moving large browser interaction scripts out of TypeScript template literals where practical.
- Continue SQL schema-reference and placeholder/bind audits.
- Do not remove compatibility routes, migrations, completion/history/archive tables without usage evidence.
