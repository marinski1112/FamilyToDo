# Wave47 residual analysis

## Findings fixed
1. Unassigned task completion was still possible through the canonical toggle endpoint despite the stated lifecycle policy.
2. Unassigned item completion was still possible.
3. Unassigned shopping completion was still possible.
4. Recurring occurrence completion had no current-assignee authorization check.
5. ANY completion predicates could report completed from an operational snapshot even when there were zero active assignees.

## Remaining
- Full device-level smartphone QA still requires actual browser/device execution.
- Completion history administration/report UI remains absent.
- Family-wide deletion/retention policy remains unspecified.
- Notification delivery history remains separate from business completion history.
- A full automated integration matrix against remote D1 is still pending.
- Completion -> uncompletion -> re-completion notification policy remains intentionally conservative: an uncompleted task does not automatically recreate an old reminder that may already be in the past.
- Recurring stop/restart notification regeneration remains dependent on explicit reminder data; the current recurring-task UI does not create per-occurrence reminder schedules.
