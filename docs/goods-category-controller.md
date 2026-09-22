# Goods Category Controller (2026-09-22)

Baseline: `e84af394b066cdcd4946d8229ffb8ac214d7f158`, coordination #381, follow-up #657.

## Ownership and reconstruction

| Operation | Single UI owner | Shopping adapter/storage | Item adapter/storage |
| --- | --- | --- | --- |
| Load / reload | `goods-category-controller.js` | `/api/shopping-categories`, shopping catalog | `/api/item?view=categories`, item catalog |
| Create | common inline name editor | `action:add` | `action:category_add` |
| Rename | common inline name editor | category mutation `rename` | item `category_rename` |
| Delete | common policy dialog | category mutation `delete_many`, `kind:shopping` | same endpoint, `kind:item` |
| Reorder | common controller; drag script supplies gesture/order | shopping category order | item category order |
| Count / collapse / empty state / kind | common controller | own catalog + own visible rows | own catalog + own visible rows |

`checklist-belongings-categories.js` supplies Item rows/composers and an `ensureGroup` content factory. Its initial metadata promise is awaited; readiness is not guessed using a frame-count timeout. `checklist-category-followup.js` supplies Shopping row/composer behavior. Neither owns category mutations or header controls. Task/Event hierarchy behavior remains in `checklist-hierarchy-followup.js`.

Catalog maps and DOM identities are scoped by `shopping` or `item`. Tabs now filter categories (this intentionally supersedes the former co-visible Goods design). Same-name categories are independent. The server rejects `shared` deletion: repository search found only the removed legacy Goods UI calling it. Cached old clients fail safely instead of deleting both domains.

## Lifecycle contract

Migration **0101** adds explicit UTC `activated_at` to both catalogs. Old rows are backfilled from `created_at`, not from deployment time. Legacy zone-less timestamps retain the old client's UTC interpretation; their original time zone cannot be recovered reliably. New lifecycle timestamps always include `Z`.

Create and disabled→enabled triggers initialize/restart the lifecycle. Rename explicitly restarts the target in its mutation batch. Item rename now batches content, catalogs and order atomically. `enabled:0` is returned in metadata so a legacy disabled category with content cannot be redisplayed as active.

Display state is evaluated once in the controller: disabled → DISABLED; any rendered content (regardless of pending/completed filter) → ACTIVE; otherwise before cutoff → FRESH_EMPTY; otherwise ARCHIVED_EMPTY. Create/rename/recreate reload from the server, so freshness is never a transient JS-only state. Reorder, completion, collapse, tab and search do not update timestamps.

JST operations before 23:00 become archive-eligible at next 00:00. Operations at/after 23:00 become eligible at next 01:00. Visibility changes and a local timer re-evaluate expiry without database writes/polling.

## Last-content removal inventory

| Actual source path | Mutation | Lifecycle coverage |
| --- | --- | --- |
| `shopping-root.ts` | `update_category` | Shopping UPDATE trigger |
| `item-api.ts` | `update_category`, category rename | Item UPDATE trigger; explicit rename activation |
| `shopping-edit-page.ts` | DELETE, category/date edit | Shopping DELETE/UPDATE triggers |
| `item-edit-page.ts` | DELETE, category/date edit | Item DELETE/UPDATE triggers |
| `shopping-category-mutation-api.ts` | delete, unclassify, rename | kind-specific triggers; deleted catalog disabled in same batch |
| `item-reusable-set-api.ts`, `shopping-reusable-set-api.ts`, add/batch/message conversion | additions only | catalog create/re-enable where applicable; positive row count is ACTIVE |
| `toggle-api.ts`, `shopping-root.ts`, Google Tasks | completion only | no lifecycle trigger |
| Task deletion / orphan cleanup | goods task linkage already detached by 0100 | no Goods removal |

The empty transition uses the removed row's **date and visibility cohort**, not an all-history count. A historical Item or another member's PRIVATE row must not suppress freshness on the current checklist. Shopping's old undated completed rows are excluded using the existing midnight/01:00 visibility boundary. A single category-level timestamp may conservatively extend freshness in other empty date views; ACTIVE views are unaffected. This avoids introducing per-date/member lifecycle tables in this change. No activation is caused merely by viewing a different date or toggling completion.

Triggers run in the content mutation's transaction, including direct edit/delete paths. Family deletion is guarded against orphan catalog recreation. New family/category/date indexes bound the existence check. Catalogs and content tables stay physically separate.

## Verification and release

- Executed DOM tests load the actual old/new script stack and call actual API handlers against SQLite: copy regression both directions, active-kind filter/set controls, one rename request, empty rename after reload, both create/composers, kind-specific delete.
- Executed migration/API tests cover same names/family isolation, rename, recreate, delete/unclassify, order/completion non-activation, last delete/move/date/private cohort, atomic failure rollback and JST boundaries.
- Existing Task/Event and content contracts are retained; obsolete assertions requiring union/shared-delete/duplicate owners are replaced by these behavioral checks.
- Preview does not apply production migrations. Production migration and deploy use the existing main `npm run deploy` path. Keep build/migration evidence in #381/#657.
- Synthetic tests do not constitute the user's real iPhone acceptance. Copy-category and cross-domain deletion need post-release real-device confirmation.
