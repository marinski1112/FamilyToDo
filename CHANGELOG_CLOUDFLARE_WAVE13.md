# Family TODO LINE — Cloudflare D1 Wave 13

## Functional migration
- Task creation now supports linking to an existing event, descriptions, location and multiple assignees.
- Item creation now supports task linkage, memo and multiple assignees.
- Shopping batch registration now exposes shared assignee selection.
- Task detail can jump directly to shopping registration with the task preselected.
- Messages can be converted to a shopping item or task; a recipient is carried over as the assignee.
- Events can be edited/deleted and can have target family members.
- Item and shopping edit pages expose completion history.
- Calendar event entries link to event editing.

## Database
- No new migration required. Existing D1 tables/columns from migrations 0001–0003 are reused.

## Validation
- TypeScript `tsc --noEmit` passes.
- No secrets or production credentials are included.
