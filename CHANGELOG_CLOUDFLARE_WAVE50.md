# Cloudflare D1 Wave50

## Task creation SQL bug fix

- Fixed the canonical `POST /api/task` task INSERT statement: 18 target columns were supplied with 19 SQL values/placeholders.
- No D1 schema or migration change is required.
- The fix is limited to `src/index.ts`; existing Wave49 lifecycle hardening is retained.

## Verification

- SQL column/value count checked: 18 columns / 18 values.
- TypeScript check should pass before deployment.
- After deployment, retry task creation from the smartphone UI.

## Wave51 preparation

- Fixed the standalone item creation INSERT placeholder/value mismatch found by comparing Wave50 source with the live D1 schema.
- Added same-family active-member validation for message recipients.
- Message reminder notification inserts use `INSERT OR IGNORE` to tolerate the existing unique pending-reminder constraint.
- No D1 migration is introduced.
