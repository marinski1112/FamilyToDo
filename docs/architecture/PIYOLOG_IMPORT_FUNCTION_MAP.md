# Piyolog / Family Log import ownership

Current-source map for the Family Log import and Piyolog adapter paths. This document describes ownership only; it does not change runtime behavior.

| Concern | Canonical owner / source | Boundary |
| --- | --- | --- |
| Import page | `src/family-log-import.ts#familyLogImportPage()` | Authenticated import shell and canonical Family Log import UI. |
| Piyolog page adapter | `src/family-log-piyolog-import-page.ts#familyLogPiyologImportPage()` | Reuses the canonical page and swaps only the browser controller. It accepts preconverted JSON and optional pre-extracted images; FamilyToDo does not parse Piyolog PDF or run PDF-to-JSON AI conversion. |
| Canonical import mutation | `src/family-log-import.ts#familyLogImportApi()` | OWNER/ADMIN + CSRF. Owns validation, preview, bounded chunk import, status, rollback, and the legacy Piyolog time-repair flow. Canonical rows are written to `family_logs` with import batch/source identity. |
| Import media reconciliation wrapper | `src/family-log-import-media-boundary.ts#familyLogImportMediaBoundary()` | Wraps the canonical importer and revalidates existing private Family Log media after successful import operations; it is not a second importer. |
| Piyolog browser controller | `public/assets/family-log-import-piyolog.js` | Coordinates canonical preview/chunk/rollback with Piyolog BABY_FOOD promotion and optional private-photo upload. Browser code does not own canonical persistence. |
| Piyolog BABY_FOOD repair / media target resolution | `src/family-log-import-media-targets.ts#familyLogImportMediaTargetsApi()` | OWNER/ADMIN + CSRF, BABY/CHILD only. Explicitly promotes a safely matched existing Piyolog `MEAL` to `BABY_FOOD` in place or resolves imported `external_id` values to canonical log IDs. Ambiguous matches fail closed. |
| Private photo storage/read/delete | `src/family-log-media-api.ts#familyLogMediaApi()` | Shared authenticated same-family private-media boundary. Piyolog import never creates a separate public/media store and never overwrites an existing photo implicitly. |
| Duplicate review | `src/family-log-duplicate-preview.ts#familyLogDuplicatePreviewApi()` | Read-only OWNER/ADMIN + CSRF candidate preview. It classifies exact/likely/ambiguous pairs but deliberately does not pick a winner or mutate rows. |
| Routes | `src/page-routes.ts`, `src/context-api-routes.ts` | Page: `/app/family_log_import.php`. APIs: `/api/family-log-import`, `/api/family-log-import-media-targets`, `/api/family-log-duplicate-preview`, `/api/family-log-media`. |
| Active regression | `scripts/regression-manifest.mjs` | `family-log-piyolog-import-contract.mjs` and `family-log-media-contract.mjs` are active core-domain checks; browser syntax also includes `family-log-import-piyolog.js`. |

## Ownership rules

- `familyLogImportApi()` is the canonical Family Log importer. Piyolog-specific code adapts input/media behavior around it; it must not fork a second canonical insert path.
- Piyolog PDF parsing and AI conversion are intentionally outside FamilyToDo. The application accepts the already converted `familytodo-family-log-import-v1` JSON document and optional extracted image files.
- Import identity/deduplication belongs to the canonical importer (`import_source_key`, source/batch identity). Do not bypass it with direct `family_logs` inserts.
- Piyolog `BABY_FOOD` promotion is a bounded corrective adapter. It preserves the existing log ID/media linkage and refuses ambiguous same-time matches rather than guessing.
- Imported photos use the existing private Family Log media owner. Keep same-family authentication, CSRF on mutation, BABY/CHILD eligibility, type/size/signature validation, private R2 proxying, and durable cleanup/reconciliation.
- Photo upload is separate from record import completion. Missing or failed photo selection must not cause the canonical Family Log records to be re-imported; retry resolves the already imported target first.
- Duplicate preview is evidence only. Any future delete/merge workflow must preserve manual edits, import identity and private-media safety instead of treating the preview classification as deletion authority.
- A zero-result code search is not evidence that an import path or contract is dead; use current routing, source and active regression wiring before changing ownership.
