# Route map

Verified against current structural baseline `0b2faf7c222d72e0a1ed54da0c2797d68d28f7aa` plus the bounded Shopping API-only cleanup in this branch.

## Worker entrypoint

`wrangler.jsonc` -> `src/index.ts`

The request dispatch order in `src/index.ts` is:

1. `dispatchPublicRoute()` -> `src/public-routes.ts`
2. `dispatchEarlyAuthenticatedRoute()` -> `src/exception-routes.ts`
3. `makeContext()` -> `src/app-context.ts`
4. `dispatchContextPreludeRoute()` -> `src/exception-routes.ts`
5. `dispatchContextApiRoute()` -> `src/context-api-routes.ts`
6. `dispatchPageRoute()` -> `src/page-routes.ts`
7. `dispatchContextFallbackRoute()` -> `src/exception-routes.ts`
8. static asset fallback -> `env.ASSETS.fetch(request)`

Do not assume URL shape alone identifies the owning handler; always begin with this dispatch order.

## Canonical route owners

### Public / unauthenticated / callback routes

Owner: `src/public-routes.ts`

Includes health endpoints, OwnTracks ingress, Google Calendar watch/callback, Google Tasks callback, Google Home fulfillment/token flows, LIFF continuation, and legal pages.

### Context APIs

Owner: `src/context-api-routes.ts`

Major feature edges:

| Feature | API route owner / canonical handler |
| --- | --- |
| Task | `/api/task` -> `task-api.ts`; `/api/task-children` -> `task-children-api.ts`; `/api/task-rough-input` -> normalize + `task-rough-input-api.ts` |
| Completion | `/api/toggle` -> `toggle-api.ts` |
| Item | `/api/item` -> `item-api.ts` |
| Shopping | `/api/shopping` -> POST-only mutation owner `shopping-root.ts`; categories -> `shopping-category-api.ts` |
| Messages | `/api/messages` -> `messages-api.ts`; stamps -> `message-stamp-api.ts` |
| Family Log | mutation boundary -> `family-log-mutation-boundary.ts`; media/import/duplicate preview have dedicated modules |
| Location | device/latest/history/search/stay-address/quality/ETA/places/home each have dedicated API modules |
| Calendar stamps | read/placement/media/admin/shared catalog use dedicated stamp modules |
| Family AI | query/plan/execute/model operations -> `family-ai.ts` |
| Google Tasks | `/api/google-tasks/action` -> `google-tasks.ts` |
| Google Calendar | sync/backfill/disconnect/retry/inbound preview/apply -> Google Calendar modules |
| ICS import | preview/normalize/prepare/status/apply/rollback -> `calendar-ics-import.ts` |
| Settings | `/api/settings` -> `settings-root.ts`; AI diagnostics detail -> `settings-ai-diagnostics.ts` |
| PWA | branding/icon -> `family-pwa-branding.ts` |
| Push | subscribe/unsubscribe/test -> `web-push-api.ts` |

### Page routes

Owner: `src/page-routes.ts`

Canonical page-handler groupings:

- auth/home -> `auth-page-handlers.ts`
- checklist/task view/edit + item edit -> `task-page-handlers.ts`
- calendar -> `calendar-page-handler.ts`
- messages -> `message-page-handlers.ts`
- Shopping create/edit -> `shopping-page-handlers.ts`
- location -> `location-page.ts`
- Family Log -> `family-log-page-handler.ts`
- admin/settings/recurring -> `settings-page-handlers.ts`
- Family Journal AI page -> `family-daily-journal-ai-page.ts`
- Piyolog import -> `family-log-piyolog-import-page.ts`
- PWA settings -> `settings-pwa-branding-page.ts`

Current retired standalone-page compatibility routes are handled directly in `src/page-routes.ts`:

- `/today.php` -> canonical `/app/tasks.php?date=...`
- `/tomorrow.php` -> canonical `/app/tasks.php?date=...`
- `/app/shopping.php` -> canonical `/app/tasks.php?date=...#shopping-checklist`

These URLs are **COMPAT** only. They do not own standalone page renderers.

### Compatibility / exceptional routes

Owner: `src/exception-routes.ts`

This file currently contains three different roles and therefore must not be deleted as a whole merely because some URLs look legacy:

- early authenticated recurring handling (`/app/recurring.php`);
- authenticated OAuth/LIFF prelude routes;
- fallback compatibility routes such as `/app/api/check.php`, `/app/api/reorder.php`, webhook aliases, `/task/delete.php`, occurrence conversion, task/item new pages, and logout aliases.

Each fallback URL must be classified independently before cleanup.

## Scheduled execution graph

Owner: `src/index.ts`.

- Google Tasks inbound: cron `3,8,13,18,23,28,33,38,43,48,53,58 * * * *`.
- Notification delivery, LINE digests, Google Calendar outbox/inbound, Child Journal Calendar outbox: `*/5 * * * *`.
- Notification lifecycle cleanup, Family Log diagnostics cleanup, location arrival cleanup/history archive, Family Daily Journal + AI generation: `17 * * * *`.
- Notification lifecycle audit: `29 18 * * *`.
- Calendar watch renewal: `7,37 * * * *`.

Cron strings are infrastructure scheduling contracts; do not conflate them with family wall-clock timezone selection.
