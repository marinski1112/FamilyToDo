# Cloudflare Wave83 — 12.102.0-wave83

## Task privacy
- Migration 0023 adds `tasks.visibility_scope` (`FAMILY` / `PRIVATE`), nullable `private_owner_id`, and the family/scope/owner index. Existing tasks remain `FAMILY`.
- A shared `taskVisibilitySql`, `accessibleTaskById`, and `canAccessTask` model enforces owner-only access without an OWNER/ADMIN override.
- Ordinary one-off TASK creation/edit supports **🔒 自分専用**. The server forces ANY completion, the owner as sole assignee/notification recipient, and synchronizes child assignees. EVENT and recurrence remain FAMILY-only.
- Task lists, counts, calendar sources, direct task operations, selectors, shared message references, and direct child operations apply task visibility. Shared message/Family Log attachment selectors only accept FAMILY tasks.
- PRIVATE tasks retain `calendar_visible` independently. Inactive/deleted owners never cause automatic publication.

## Wave82 stabilization
- Family Log template input is validated without side effects before recurring create/update/future-split mutations.
- Template diagnostics now cover missing non-HOUSEWORK subjects, HOUSEWORK subjects, inactive/cross-family subjects, and subject/type incompatibility.
- Source inventory Wave82 metadata and final Wave83 version fields are aligned.

## Diagnostics and tests
- Schema/runtime health require the Wave83 task columns.
- Migration smoke verifies the new columns, default FAMILY backfill behavior, and null private owner.
- `wave83-smoke.sh` is included in `check:domain-smoke`.

## Device verification / next wave
- Verify LINE iOS/Android task new/edit controls, private visible/hidden calendar combinations, push delivery, and 404 direct-ID behavior against deployed D1.
- Private recurring tasks/events/messages/Family Logs, sharing, and encryption remain intentionally out of scope.
