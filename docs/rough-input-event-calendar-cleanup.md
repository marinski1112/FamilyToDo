# Rough input / calendar entry cleanup

This bounded change migrates Task/Event creation off the obsolete `public/assets/task-new.js` controller while preserving the legacy-compatible `/task/new.php` URL.

## Completed contracts

- AI rough input is the canonical create workflow for Task/Event/Shopping/Item.
- Explicit EVENT input treats a date-only line immediately followed by a title as one semantic event block. The browser helper keeps the original textarea text intact for the user, while the authenticated `/api/task-rough-input` route applies the same EVENT-only normalization before the canonical server parser so callers that bypass client JavaScript get the same block boundary.
- Ordinary adjacent EVENT title lines stay separate; adjacent date-only lines and metadata lines are not over-merged.
- Manual Task/Event entry derives its type from the explicit primary type selector. EVENT omits assignee, completion, event-toggle, and no-deadline controls; TASK has no redundant event-toggle. EVENT persistence continues through the existing task API with empty assignees, the existing EVENT completion default, and `noDate=false`.
- Calendar color values and order remain unchanged. Visible `TimeTree` suffixes are removed, a color swatch is shown independently of native select styling, and only valid `#RRGGBB` create-time colors are remembered. Storage failure or invalid stored values are ignored; edit pages retain their saved task color rather than applying the create-time preference.
- `public/assets/task-new.js` and the obsolete `taskNew()` renderer are retired. The missing legacy `src/client/task-new.ts` source is not recreated.
- `/task/new.php` remains only as a compatibility URL and routes to the unified entry renderer. `?event=1` explicitly preselects EVENT; otherwise TASK is selected.
- Shopping and Item specialized behavior, DB/schema, recurrence, PRIVATE visibility, Google Calendar semantics, auth/session, CSRF, and tenant boundaries are unchanged by this cleanup.

## Deferred nighttime route/source cleanup scope

Do not perform a broad routing refactor as part of this bounded change. A later nighttime cleanup should actual-inventory the following source graph before deleting anything:

- `src/page-routes.ts`
- `src/exception-routes.ts`
- `src/task-page-handlers.ts`
- `src/task-entry-page.ts`
- `src/task-edit-page.ts`
- `src/task-events-page.ts`
- `src/new-entry-pages.ts`
- `src/task-rough-input-api.ts`
- `public/assets/task-entry-*.js`
- `public/assets/task-rough-input-*.js`
- calendar-color-related assets
- legacy PHP-compatible URLs
- `task/new`, `task/edit`, and `task/view`
- Shopping/Item new/edit paths
- app-side entry points

For each path, determine from current source: (1) canonical handler, (2) compatibility alias, (3) dead route, (4) duplicate renderer, (5) orphan asset, (6) generated asset without a clear source of truth, (7) stale references in app shell/package checks/source inventory if present, and (8) legacy PHP-compatible links that still require an alias.

The later deliverable should be one actual-source-backed table:

`URL -> router -> page renderer -> client asset -> API/save handler`

The purpose is canonical-source clarity and removal of proven dead/duplicate paths, not behavior changes. Anything with a live reference must remain until its caller is migrated.
