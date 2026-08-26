# Cloudflare D1 Wave50

## Task creation SQL bug fix

- Fixed the canonical `POST /api/task` task INSERT statement: 18 target columns were supplied with 19 SQL values/placeholders.
- No D1 schema or migration change is required.
- The fix is limited to `src/index.ts`; existing Wave49 lifecycle hardening is retained.

## Verification

- SQL column/value count checked: 18 columns / 18 values.
- TypeScript check should pass before deployment.
- After deployment, retry task creation from the smartphone UI.
