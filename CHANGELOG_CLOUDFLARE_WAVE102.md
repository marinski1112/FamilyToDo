# Cloudflare Wave102 — 12.121.0-wave102

## Reliability fixes

- Kept Family Log repair click handlers inside the same strict IIFE as the private `call()` client. Failures are shown in the page status as well as a concise alert, zero targets cannot be applied, and the asset URL has a Wave102 cache key.
- Added `queueCalendarProjectionAfterMutation()` as the single local-mutation decision point. Eligible unlinked tasks enqueue CREATE, eligible linked tasks enqueue UPDATE, and linked tasks that become PRIVATE, hidden, undated, recurring, or deleted enqueue DELETE. Google inbound never invokes this helper.
- Task deletion now completes its D1 batch before enqueueing the external projection cleanup.

## Existing-data and status UX

“既存の予定を同期” previews before enqueueing. Wave102 limits candidates to eligible, non-recurring FAMILY TASK/EVENT rows that are either incomplete or dated today/later. Linked rows enqueue UPDATE rather than duplicate CREATE; old completed history is excluded.

Manual sync reports pending counts before/after and an `unchanged` result. The normal UI says “変更はありません”; calendar creation, sync-token presence, pending/error counts, and linked count are kept in a disclosure and never expose IDs or token values.

## Database

No migration. Wave102 uses migration 0034's current account, link, state, and unique outbox schema.
