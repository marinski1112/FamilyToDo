# Wave62 residual analysis

## Fixed in this wave

### P0/P1 latent DB bugs
1. `shopping_items.group_key` was referenced by several Worker SQL paths even though the D1 schema does not contain that column.
   - affected task creation with attached shopping
   - task edit when adding child shopping
   - recurring task create/update with attached shopping
   - DB runtime/schema health probe
   - recurrence exception child shopping clone
2. Recurrence occurrence conversion page used HTML form POST while the Worker handler parsed JSON only.
3. The exception-task INSERT had a placeholder/bind mismatch.

### Calendar parity
- Day-detail reorder is now restored using mobile-safe up/down controls.
- Existing `/app/api/reorder.php` is hardened to validate family ownership.

### UI
- Message editing no longer relies on `prompt()`.
- Family invitation history/revoke is visible from member settings.

## Important residuals

### Recurring lifecycle
- Verify exception conversion in production with:
  - incomplete occurrence
  - completed ANY occurrence
  - completed ALL occurrence
  - linked shopping/items
  - subsequent edit/delete of exception task
- Define whether deleting an exception task should restore the recurring occurrence or keep that date excluded.
- Define future-only vs whole-series edits.
- Audit recurrence notification scheduling for exception dates.

### Shopping / items
- Continue SQL-vs-schema audit after discovering the invalid shopping `group_key` references.
- Clarify whether a shopping grouping key is actually needed. If it is needed in the product design, add it only through a new migration; do not assume the column exists.
- Continue compact list/detail-sheet UI consistency.

### Calendar
- Verify reorder behavior for multi-day normal tasks that appear on several dates.
- Consider whether per-day order or global task order is the desired model; current schema stores one `sort_order` per task.
- Add a compact overflow sheet for >3 simultaneous multi-day lanes if the current `+N件` display is insufficient.
- Consolidate legacy XREA and Worker calendar CSS after the stable-band layout is proven.

### Messages
- `convert_shopping` still uses a simple product-name prompt. Replace with a proper conversion sheet if richer category/quantity/due/task/assignee fields are desired.
- Define lifecycle when a converted task/shopping item is later deleted.

### Invitations
- Existing historical invitation rows created before Wave62 may contain UTC-formatted `expires_at` values while the rest of the app uses Asia/Tokyo wall-clock strings. Do not bulk-rewrite without reviewing real remote data.
- Consider explicit `revoked_at` in a future migration if audit distinction between natural expiry and manual revoke becomes important. Wave62 models revoke by setting `expires_at` to now.

### Notifications / deletion lifecycle
- Continue orphan/pending/retry audit after task/message/recurrence edits and deletes.
- Validate no duplicate notification rows are created after repeated edits.

### Repository cleanup
- Move historical Wave docs under `docs/history/` only after migration stabilizes.
- Do not delete migrations, compatibility route aliases or completion/history/archive tables merely for tidiness.
