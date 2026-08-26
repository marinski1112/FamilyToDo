# Wave50 residual analysis

## Fixed

1. `POST /api/task` failed before inserting a task because the INSERT statement specified 18 columns but 19 SQL values/placeholders.
2. This was an application SQL construction bug, not a D1 migration/schema mismatch.

## Not changed

- No D1 migration is introduced.
- Event is not reintroduced; the application remains task-centric.
- Wave49 assignee validation and creation cleanup remain intact.
- Smartphone/device QA still requires actual browser execution.

## Verification

- Canonical task INSERT now has exactly 18 values for 18 columns.
- TypeScript check must pass before deployment.
- After deployment, retry task creation including task-only, shopping child, item child, assignee, and reminder combinations.
