# Config and function ownership map

Verified against baseline `787d3633ba365318fea13027d72df67ffb66eda3`.

This file identifies canonical owners and cleanup candidates. A candidate is not permission to remove code; current callers and dynamic routes must be checked first.

## Timezone ownership

Canonical helper module: `src/timezone.ts`.

- `DEFAULT_FAMILY_TIMEZONE = 'Asia/Tokyo'` is the fallback default, not the canonical value for every family.
- `validateTimezone()` validates configured IANA timezone values.
- `formatFamilyDateTime()`, `familyNow()`, and `familyDate()` are family wall-clock helpers.
- `utcNow()` is explicitly for infrastructure UTC-naive timestamps.
- `formatStoredUtcForFamily()` converts stored infrastructure UTC-naive values for family display; it must not be used for already-family-local domain wall clocks.
- `parseImportDateTime()` distinguishes naive family-local inputs from offset/UTC instants.

Canonical member-context resolution: `src/app-context.ts`.

`memberById()` reads `families.timezone` as `family_timezone`, falling back to `env.APP_TIMEZONE` and then `DEFAULT_FAMILY_TIMEZONE` only when the family setting is absent.

Therefore the cleanup rule is:

> Family-facing domain/display logic should prefer the current member/family timezone. A literal `Asia/Tokyo` or `env.APP_TIMEZONE` is not automatically a bug, but any path that bypasses an available `family_timezone` must be reviewed.

PR #776 is a reference example: Family Journal archived location times were corrected to use the existing configured family timezone rather than a disconnected display assumption.

## Known duplicate-function candidate

`asDateOffset(days, timeZone=DEFAULT_FAMILY_TIMEZONE)` is currently locally defined in both:

- `src/page-routes.ts`
- `src/exception-routes.ts`

Both implementations derive a family date, construct a noon UTC anchor, add UTC days, and return `YYYY-MM-DD`.

Classification: **duplicate candidate, not yet removed**.

Before centralizing it, verify all date-boundary callers and contracts. If semantics are identical, move it to a canonical date/time utility and update both route owners in one bounded PR.

## Router ownership

Canonical Worker dispatch owner: `src/index.ts`.

Canonical route tables:

- `src/public-routes.ts`
- `src/context-api-routes.ts`
- `src/page-routes.ts`
- `src/exception-routes.ts`

Feature code should not add a second hidden route table when one of these owners is appropriate.

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

For every mapped canonical helper, future structural work should record:

1. owner module;
2. public/exported function names;
3. direct route/caller group;
4. DB tables touched where relevant;
5. external side effects;
6. regression contracts/tests;
7. privacy/auth/tenant constraints;
8. legacy aliases or duplicate candidates.

This prevents a developer from having to rediscover the entire repository for a bounded change.