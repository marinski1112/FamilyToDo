# Wave45 residual analysis

## Findings fixed
1. `task_completions`, `item_completions`, and `shopping_completions` lacked unique constraints although the application uses `ON CONFLICT(entity_id, member_id)`.
2. ALL-mode completion counts included completion snapshots from inactive/non-current assignees.
3. Recurrence occurrence detail used a different completion-count rule from the toggle endpoint.
4. Stopping/deleting a member left operational assignments and completion snapshots attached to the inactive member.
5. Task-edit child removal archived `shopping_completion_history` but omitted legacy `shopping_completions`.

## Remaining
- Completion history still has no dedicated administration/report UI.
- Full device-level smartphone QA still requires actual browser/device execution.
- Family-wide deletion/retention remains unspecified and intentionally unimplemented.
- Notification delivery history remains separate from business completion history.
