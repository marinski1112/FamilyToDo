# Wave66 residual analysis

## Production checks
1. Calendar ordinary tasks use the first available row.
2. Today/Tomorrow has one effective task-level shopping add control.
3. Exception delete -> restore returns the recurrence occurrence.
4. Exception delete -> exclude keeps the date suppressed.
5. Future-only recurring edit splits the series at the selected date.
6. Existing recurring shopping/items survive whole-series edits and future splits.
7. Notification cron emits no lifecycle audit warning in the normal state.

## Remaining lifecycle work
- Optional admin UI to restore a previously excluded recurrence date.
- Visual lineage for old/new series after a future-only split.
- Further notification orphan/duplicate and conversion/delete audits.
- Move large recurring/messages/settings interactive scripts into syntax-checkable static JS.
- Consolidate calendar CSS only after continued production stability.
