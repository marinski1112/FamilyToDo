# Config and function ownership map

Verified against current structural baseline `d7ccdc50cab1be951625cb48b7c0873e56d31f59`.

This file identifies canonical owners and cleanup candidates. A candidate is not permission to remove code; current callers and dynamic routes must be checked first.

## Timezone ownership

Canonical helper module: `src/timezone.ts`.

- `DEFAULT_FAMILY_TIMEZONE = 'Asia/Tokyo'` is the fallback default, not the canonical value for every family.
- `validateTimezone()` validates configured IANA timezone values.
- `formatFamilyDateTime()`, `familyNow()`, and `familyDate()` are family wall-clock helpers.
- `asDateOffset()` derives a `YYYY-MM-DD` family date offset for route date defaults/navigation while preserving the caller-selected timezone.
- `utcNow()` is explicitly for infrastructure UTC-naive timestamps.
- `formatStoredUtcForFamily()` converts stored infrastructure UTC-naive values for family display; it must not be used for already-family-local domain wall clocks.
- `parseImportDateTime()` distinguishes naive family-local inputs from offset/UTC instants.

Canonical member-context resolution: `src/app-context.ts`.

`memberById()` reads `families.timezone` as `family_timezone`, falling back to `env.APP_TIMEZONE` and then `DEFAULT_FAMILY_TIMEZONE` only when the family setting is absent.

Therefore the cleanup rule is:

> Family-facing domain/display logic should prefer the current member/family timezone. A literal `Asia/Tokyo` or `env.APP_TIMEZONE` is not automatically a bug, but any path that bypasses an available `family_timezone` must be reviewed.

PR #776 is a reference example: Family Journal archived location times were corrected to use the existing configured family timezone rather than a disconnected display assumption.

## Date-offset helper ownership

`asDateOffset(days, timeZone=DEFAULT_FAMILY_TIMEZONE)` is owned by `src/timezone.ts`.

The previously identical local implementations in `src/page-routes.ts` and `src/exception-routes.ts` were centralized after confirming the same signature, body, caller-selected timezone semantics, and live date-boundary call sites. Route caller expressions remain unchanged.

Classification: **canonicalized duplicate helper**.

## Router ownership

Canonical Worker dispatch owner: `src/index.ts`.

Canonical route tables:

- `src/public-routes.ts`
- `src/context-api-routes.ts`
- `src/page-routes.ts`
- `src/exception-routes.ts`

Feature code should not add a second hidden route table when one of these owners is appropriate.

## Shopping ownership

| Concern | Canonical owner | Route/caller | Data / side effects | Regression boundary |
| --- | --- | --- | --- | --- |
| Shopping mutations | `src/shopping-root.ts#shopping()` | `POST /api/shopping` via `src/context-api-routes.ts` | `shopping_items`, `shopping_assignees`, `shopping_completion_history`; `to_task` also creates/links a task and queues Google Calendar projection | `shopping-domain-boundary-contract.mjs`, `shopping-new-page-boundary-contract.mjs` |
| Shopping checklist/read presentation | `src/task-events-page.ts` | `/app/tasks.php?date=...#shopping-checklist` | reads Shopping + linked task/assignee data; completion transport uses canonical toggle/API paths | `task-events-page-boundary-contract.mjs`, Shopping UI contracts |
| Shopping create page | `src/shopping-new-page.ts` | `/app/shopping_new.php` | submits to `/api/shopping`; category registration uses `/api/shopping-categories` | `shopping-new-page-boundary-contract.mjs` |
| Shopping edit page | `src/shopping-edit-page.ts` | `/app/shopping_edit.php` | update/delete, assignee reconciliation, completion archive | `shopping-new-page-boundary-contract.mjs`, `shopping-domain-boundary-contract.mjs` |
| Legacy standalone Shopping URL | `src/page-routes.ts` COMPAT redirect | `/app/shopping.php` | no renderer / no data ownership | page-route + Shopping boundary contracts |

The retired standalone Shopping GET renderer is not a canonical owner. Its former page-only asset `public/assets/shopping.js` was proven unreachable after renderer retirement and removed; product-link safety remains covered on the active create and canonical checklist surfaces by `shopping-product-url-safety-contract.mjs`.

## Task / Item / Completion ownership

The authenticated API dispatcher for this domain is `src/context-api-routes.ts`. It owns the canonical `/api/task`, `/api/task-children`, `/api/task-rough-input`, `/api/item`, and `/api/toggle` wiring; feature modules own behavior below that routing boundary.

| Concern | Canonical owner / exported function | Route/caller | Data / external side effects | Authorization / visibility boundary | Regression boundary |
| --- | --- | --- | --- | --- | --- |
| Task create/update/delete | `src/task-api.ts#taskApi()` | `/api/task` via `src/context-api-routes.ts` | owns task persistence plus task assignees; create flow may persist linked `shopping_items` / `items` and notifications; delete/archive flow covers task, item, Shopping and recurrence completion state; task mutation queues Google Calendar projection and wakes the calendar outbox | authenticated member + CSRF for mutation; task access is filtered through canonical `taskVisibilitySql()`; PRIVATE persistence carries `visibility_scope` / `private_owner_id` and assignee restrictions | `task-api-modularity-contract.mjs`, `task-visibility-boundary-contract.mjs`, `context-api-route-dispatcher-contract.mjs`, `task-delete-modularity-contract.mjs` |
| Task hierarchy validation/persistence | `src/task-hierarchy.ts#validateTaskParentLink()` consumed by `src/task-api.ts#taskApi()` | explicit `parent_task_id` on `/api/task` create | nullable `tasks.parent_task_id`; no automatic recurrence, assignee, Shopping, Item, or completion inheritance | same-family parent; one shallow level; FAMILY/PRIVATE visibility parity; PRIVATE owner parity; self/cross-family/deeper links rejected | `task-hierarchy-foundation-contract.mjs`, `task-api-modularity-contract.mjs` |
| Task child read model | `src/task-children-api.ts#taskChildrenApi()` | `GET /api/task-children?parent_id=...` | reads parent/child `tasks`, active `task_assignees` and `members`; returns child status, schedule, assignees, completion mode and edit/add capability | authenticated member; parent and each child use `taskVisibilitySql()`; add/edit capability is OWNER/ADMIN or creator and child addition is limited to top-level parents | `context-api-route-dispatcher-contract.mjs`, `task-visibility-boundary-contract.mjs`, `task-hierarchy-foundation-contract.mjs` |
| Item creation/linking | `src/item-api.ts#itemApi()` | `POST /api/item` via `src/context-api-routes.ts` | inserts `items` and `item_assignees`; optional task linkage remains explicit on the item | authenticated member + CSRF; linked task lookup uses `taskVisibilitySql()`; PRIVATE task linkage preserves private-owner assignment semantics | `item-api-modularity-contract.mjs`, `task-visibility-boundary-contract.mjs`, `context-api-route-dispatcher-contract.mjs` |
| Task / recurrence / Item / Shopping completion | `src/toggle-api.ts#toggle()` | canonical `/api/toggle`; COMPAT `/app/api/check.php` and `/app/api/check` reuse the same function | owns per-member completion ledgers and completion history for task/item/Shopping/recurrence; task completion also writes activity state; recurrence aggregate compatibility is delegated to `src/recurrence-completion-state.ts` | authenticated member + CSRF; assigned entities require the acting assignee; unassigned entities remain completable by an active family member; Item/Shopping may inherit task assignees when they have no direct assignees; task visibility is enforced through `taskVisibilitySql()` | `toggle-api-boundary-contract.mjs`, `recurrence-toggle-authorization-order-contract.mjs`, `recurrence-overdue-invariant-contract.mjs`, `task-visibility-boundary-contract.mjs`, `exception-route-dispatchers-contract.mjs` |
| AI rough-input analysis | `src/task-rough-input-api.ts#taskRoughInputApi()` and trusted-server `analyzeTaskRoughInput()` | `POST /api/task-rough-input`; dispatcher first applies `normalizeEventRoughInputRequest()` | analysis only: deterministic parsing/validation plus bounded Gemini primary/fallback when required; optional public product-link preview; AI generation diagnostics and request/cost guard. Persistence authority remains with the normal task/Shopping/Item mutation owners | authenticated member; browser API requires CSRF; model output is provenance-validated and cannot change the requested destination; trusted-server callers may provide already-authorized context | `task-rough-input-ai-cost-guard-contract.mjs`, `task-rough-input-product-link-contract.mjs`, `task-rough-input-multi-url-split-contract.mjs`, `task-rough-input-shared-deadline-contract.mjs`, `task-rough-input-multiplier-dimension-contract.mjs`, `context-api-route-dispatcher-contract.mjs` |

### Task-domain cleanup rules

- Do not move completion writes into page renderers. `toggle()` is the canonical completion mutation boundary for task, recurrence, Item, and Shopping state.
- Do not treat `/app/api/check.php` as a second completion implementation. It is a COMPAT route alias that delegates to the same `toggle()` owner.
- Do not infer parent-child inheritance that is not explicit in current source. A child remains its own task row; recurrence, assignees, linked Shopping/Items, and completion state are not implicitly inherited from the parent.
- Do not bypass `taskVisibilitySql()` when adding task-linked reads or mutations. PRIVATE visibility and owner identity are part of the domain contract, not page-only filtering.
- `taskRoughInputApi()` analyzes and validates input; it does not replace canonical persistence owners. AI output must continue through the normal task/Shopping/Item save paths.

## Function cleanup classifications

| Candidate | Evidence required before action | Action |
| --- | --- | --- |
| private/local function with no callers | exact current module + static/dynamic caller check | remove if proven unused |
| exported function with no static import | dynamic/route/string-dispatch check required | UNKNOWN until proven |
| two same-name/same-body helpers | compare semantics, error behavior, timezone/auth/tenant context | centralize if equivalent |
| duplicated SQL/business rule | compare transaction boundaries and side effects | centralize only if contract is identical |
| compatibility adapter | identify live URL/caller and replacement | keep until migration is proven |
| hardcoded config value | identify canonical setting and fallback contract | replace only when it bypasses canonical configuration |
| default/fallback constant | prove whether it is intentional fallback | normally keep |

## Development lookup contract

For every mapped canonical helper or feature boundary, future structural work should record:

1. owner module;
2. public/exported function names;
3. direct route/caller group;
4. DB tables touched where relevant;
5. external side effects;
6. regression contracts/tests;
7. privacy/auth/tenant constraints;
8. legacy aliases or duplicate candidates.

This prevents a developer from having to rediscover the entire repository for a bounded change.