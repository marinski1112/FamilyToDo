# Wave72 residual analysis

## Production QA priority
1. LIFF entry:
   - open from LINE with no Worker session
   - authenticate successfully
   - retry after a simulated/network failure if possible
2. Family onboarding:
   - family create
   - family-code join
   - invitation-token join
3. Carry item:
   - create with no task
   - create linked to a task/event
   - multiple assignees
4. Regression:
   - recurring delete
   - recurrence exception delete with restore/exclude
   - event completion remains unavailable

## Next implementation sequence
1. Introduce a unified `/app/tasks.php` page while keeping `/today.php` and `/tomorrow.php` as compatibility routes.
2. After the unified Tasks page is production-stable, change the six-menu layout to:
   - タスク
   - カレンダー
   - 買い物
   - 家族ログ
   - 伝言
   - 管理
3. Do not create/switch LIFF to the Family Log page until a usable Family Log MVP exists; notify the user at that point.
4. After Tasks consolidation, add PWA/Web Push groundwork before large childcare-log expansion.
5. Family Log MVP should use dedicated log tables rather than overloading `tasks`.

## Remaining technical debt
- Continue pushing destructive/archive operations through shared lifecycle helpers.
- `recurrence split future` archival uses date-filtered SQL and is intentionally not replaced by the whole-rule helper.
- Remaining browser interactions should be audited for inline script/template-literal risks.
- Calendar CSS consolidation should remain deferred while the current production layout is stable.
