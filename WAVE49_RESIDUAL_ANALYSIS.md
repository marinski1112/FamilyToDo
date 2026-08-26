# Wave49 residual analysis

## Fixed in this wave

1. Added `/__cf/db-runtime-health`, independently executing critical D1 read queries so schema/constraint failures are identified by area instead of an opaque 500.
2. Added a request ID to internal-error responses while keeping detailed exceptions in Workers Observability.
3. Validated task assignees against active members of the current family.
4. Added cleanup of the newly-created task and its child rows when a later task-creation write fails.

## Not changed

- No new D1 migration is introduced in Wave49. Diagnose the remote schema before changing it.
- Event is not reintroduced; the application remains task-centric.
- Smartphone/device QA still requires actual browser execution.
- Completion-history administration and family-wide retention policy remain future work.

## Verification

- TypeScript check must pass before deployment.
- After deployment, check `/__cf/db-schema-health` and `/__cf/db-runtime-health`, then retry settings and task creation.
