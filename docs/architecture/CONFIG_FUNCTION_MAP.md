# Config and function ownership map

Verified against structural baseline `e498bb5f52115c818671fd75cd0b59272a6bab33` plus the bounded Shopping dead-asset cleanup in this branch.

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
