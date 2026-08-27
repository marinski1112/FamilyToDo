# Wave78 residual analysis

## Production QA
1. Apply migration 0019 before deploying the Wave78 Worker.
2. Open Family Log and inspect one BABY / CHILD / ADULT / PET profile.
3. Use `おすすめに戻す` and confirm each profile gets the expected preset.
4. Toggle one item OFF, save, reopen, and confirm it remains hidden without deleting old history.
5. BABY/CHILD/PET:
   - link a log to an unassigned task
   - save
   - confirm the recorder becomes the task assignee/completer
   - confirm the task detail/history shows that family member
6. Link a care log to a task assigned only to somebody else:
   - the log should save
   - the task should not be silently reassigned/completed
   - the UI should show the explanatory message
7. Admin -> Family activity log:
   - create/edit/delete a Family Log row
   - confirm type / subject / actor / time appear
   - confirm linked-task completion shows `家族ログから`
8. Admin on an unlinked CHILD profile -> `LINE本登録へ招待`:
   - invite link appears
   - invite page says the existing Family Log history will be inherited
   - after a separate LINE account joins, the same subject keeps all prior logs
9. Data diagnostics:
   - new Family Log link / promotion-invite categories should normally be zero.

## Deliberately conservative behavior
- A recorder who is not an assignee on an already-assigned task is not automatically added. This avoids altering `ALL` completion semantics or silently changing task ownership.
- Existing LINE members with a different Family Log subject are not automatically merged during promotion. Person/profile merges require explicit semantics and should be implemented as a dedicated admin merge tool later.
- PET profiles cannot be promoted to LINE members.

## Next Family Log priorities
- breastfeeding left/right independent timers
- structured medicine name / dose / unit
- week/month trend charts for weight, temperature, sleep, milk and activity
- subject icon/order controls
- task/recurrence quick actions that preselect a Family Log subject/type
- profile merge UI for the rare case where a person joins before a historical child profile is promoted
- activity-log filters by family member / subject / action

## Web Push priorities
- device list and last-success/failure visibility
- per-device disable/delete
- notification delivery diagnostics
- retry policy review
