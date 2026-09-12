# Route and site-connection map

Verified against current main `c82da00e7d7b3171b1d2a45613b3929ed152ef69` (`12.148.0-wave128`).

This document is a navigation map, not the source of truth. Current runtime source, `wrangler.jsonc`, migrations, and active regression contracts remain authoritative. When source and this map disagree, source wins and the map should be updated with the structural change.

## Classification

| Class | Meaning |
| --- | --- |
| `ACTIVE` | Current first-class application page/API/runtime entrypoint |
| `COMPAT` | Retained old URL/alias that forwards into a current canonical path or handler |
| `EXTERNAL` | Current callback, webhook, OAuth, LIFF, device or provider-facing entrypoint |
| `DIAGNOSTIC` | Current health/diagnostic entrypoint |
| `ASSET` | Worker/static asset boundary rather than application feature route |

A `.php` suffix does **not** imply `COMPAT`. For example `/task/new.php` is currently an `ACTIVE` route into the canonical task-entry implementation.

## Worker request dispatch order

`wrangler.jsonc` -> `src/index.ts`.

Every request handled by the Worker follows this order:

1. `dispatchPublicRoute()` -> `src/public-routes.ts`
2. `dispatchEarlyAuthenticatedRoute()` -> `src/exception-routes.ts`
3. `makeContext()` -> `src/app-context.ts`
4. `dispatchContextPreludeRoute()` -> `src/exception-routes.ts`
5. `dispatchContextApiRoute()` -> `src/context-api-routes.ts`
6. `dispatchPageRoute()` -> `src/page-routes.ts`
7. `dispatchContextFallbackRoute()` -> `src/exception-routes.ts`
8. static asset fallback -> `env.ASSETS.fetch(request)`

Do not infer ownership from URL shape alone. Earlier dispatchers can intercept a path before the normal page/API dispatchers.

## Public, external and diagnostic routes

Owner: `src/public-routes.ts`. These routes run before authenticated app context is constructed, except `/__cf/auth-health`, which explicitly constructs context for its diagnostic.

| URL | Class | Handler / owner | Purpose |
| --- | --- | --- | --- |
| `/privacy` | ACTIVE | `legal-pages.ts#privacyPage()` | Privacy page |
| `/terms` | ACTIVE | `legal-pages.ts#termsPage()` | Terms page |
| `/__cf/health` | DIAGNOSTIC | inline `public-routes.ts` | Worker health |
| `/__cf/secrets-health` | DIAGNOSTIC | inline `public-routes.ts` | Secret binding health surface |
| `/__cf/db-health` | DIAGNOSTIC | inline D1 `SELECT 1` | D1 reachability |
| `/__cf/db-schema-health` | DIAGNOSTIC | `runtime-diagnostics.ts#dbSchemaHealth()` | Schema health |
| `/__cf/db-runtime-health` | DIAGNOSTIC | `runtime-diagnostics.ts#dbRuntimeHealth()` | Runtime DB health |
| `/__cf/auth-health` | DIAGNOSTIC | `auth-health.ts#authHealth()` | Auth/context health |
| `/__cf/google-home-health` | DIAGNOSTIC | `google-home.ts#googleHomeHealth()` | Google Home health |
| `/__cf/integrations-health` | DIAGNOSTIC | `environment-health.ts#integrationsHealthResponse()` | Integration config health |
| `/api/location/owntracks` | EXTERNAL | `location-owntracks-ingress.ts#ownTracksLocationIngress()` | OwnTracks device ingress |
| `/api/google-calendar/watch` | EXTERNAL | `google-calendar-one-way.ts#calendarWatchNotification()` | Google Calendar watch notification |
| `/oauth/google/token` | EXTERNAL | `google-home.ts#googleToken()` | Google Home OAuth token endpoint |
| `/oauth/google-tasks/callback` | EXTERNAL | `google-tasks.ts#googleTasksCallback()` | Google Tasks OAuth callback |
| `/oauth/google-calendar/callback` | EXTERNAL | `google-calendar.ts#googleCalendarCallback()` or inbound callback by state | Google Calendar OAuth callback multiplexed by OAuth state |
| `/api/google-home/fulfillment` | EXTERNAL | `google-home-execute-diagnostics.ts#googleFulfillmentWithExecuteDiagnostics()` | Google Home fulfillment |
| `/liff`, `/liff/*` | EXTERNAL | `oauth-continuation.ts#liffDispatcher()` | LINE LIFF entry/continuation |
| `/oauth/line/google-home/start` | EXTERNAL | `oauth-continuation.ts#lineGoogleHomeStart()` | LINE -> Google Home OAuth start |
| `/oauth/line/google-home/callback` | EXTERNAL | `oauth-continuation.ts#lineGoogleHomeCallback()` | LINE -> Google Home callback |
| `/oauth/google/continue` | EXTERNAL | `oauth-continuation.ts#resumeGoogleHome()` | Google Home OAuth continuation |

## Authenticated context APIs

Owner: `src/context-api-routes.ts`. These run after `makeContext()` and the authenticated prelude routes.

### Family, task, item, message and Shopping

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/api/family/create` | ACTIVE | `family-create-api.ts#createFamily()` |
| `/api/family/join` | ACTIVE | `family-join-api.ts#joinFamily()` |
| `/api/family/invite` | ACTIVE | `family-invite-api.ts#inviteCreate()` |
| `/api/me` | ACTIVE | `api-me.ts#apiMe()` |
| `/api/toggle` | ACTIVE | `toggle-api.ts#toggle()` |
| `/api/task` | ACTIVE | `task-api.ts#taskApi()` |
| `/api/task-children` | ACTIVE | `task-children-api.ts#taskChildrenApi()` |
| `/api/task-rough-input` | ACTIVE | normalize via `task-rough-input-event-normalize.ts`, then `task-rough-input-api.ts#taskRoughInputApi()` |
| `/api/item` | ACTIVE | `item-api.ts#itemApi()` |
| `/api/messages` | ACTIVE | `messages-api.ts#messages()` |
| `/api/message-stamps` | ACTIVE | `message-stamp-api.ts#messageStampApi()` |
| `/api/shopping` | ACTIVE | POST-only `shopping-root.ts#shopping()` |
| `/api/shopping-categories` | ACTIVE | `shopping-category-api.ts#shoppingCategoryApi()` |

### Location

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/api/location/devices` | ACTIVE | `location-device-api.ts#locationDeviceApi()` |
| `/api/location/latest` | ACTIVE | `location-latest-api.ts#locationLatestApi()` |
| `/api/location/history` | ACTIVE | `location-history-api.ts#locationHistoryApi()` |
| `/api/location/history-search` | ACTIVE | `location-history-api.ts#locationHistorySearchApi()` |
| `/api/location/stay-address` | ACTIVE | `location-history-api.ts#locationStayAddressApi()` |
| `/api/location/quality-diagnostics` | ACTIVE | `location-quality-diagnostics-api.ts#locationQualityDiagnosticsApi()` |
| `/api/location/eta` | ACTIVE | `location-route-api.ts#locationRouteEtaApi()` |
| `/api/location/places` | ACTIVE | `location-places-api.ts#locationPlacesApi()` |
| `/api/location/home` | ACTIVE | `location-home-api.ts#locationHomeApi()` |

### Family Log and journals

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/api/family-log` | ACTIVE | `family-log-mutation-boundary.ts#familyLogMutationBoundary()` |
| `/api/family-log-media` | ACTIVE | `family-log-media-api.ts#familyLogMediaApi()` |
| `/api/family-log-import-media-targets` | ACTIVE | `family-log-import-media-targets.ts#familyLogImportMediaTargetsApi()` |
| `/api/family-log-duplicate-preview` | ACTIVE | `family-log-duplicate-preview.ts#familyLogDuplicatePreviewApi()` |
| `/api/family-log-import` | ACTIVE | media-boundary `family-log-import-media-boundary.ts` |
| `/api/child-journal` | ACTIVE | `child-journal.ts#childJournalApi()` |
| `/api/recurrence/family-log-complete` | ACTIVE | `family-log-occurrence-api.ts#recordOccurrenceFamilyLog()` |

### Calendar stamps

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/api/calendar-stamps` | ACTIVE | `calendar-stamp-api.ts#calendarStampReadApi()` |
| `/api/calendar-stamp-options` | ACTIVE | `calendar-stamp-placement-api.ts#calendarStampOptionsApi()` |
| `/api/calendar-stamp-placement` | ACTIVE | `calendar-stamp-placement-api.ts#calendarStampPlacementApi()` |
| `/api/calendar-stamp-media` | ACTIVE | `calendar-stamp-media-api.ts#calendarStampMediaReadApi()` |
| `/api/calendar-stamp-admin/assets` | ACTIVE | `calendar-stamp-admin-api.ts#calendarStampAdminAssetsApi()` |
| `/api/calendar-stamp-admin/shared-catalog` | ACTIVE | `calendar-shared-stamp-api.ts#calendarSharedStampCatalogAdminApi()` |
| `/api/calendar-stamp-admin/shared-publish` | ACTIVE | `calendar-shared-stamp-publish-api.ts#calendarSharedStampPublishAdminApi()` |
| `/api/calendar-stamp-admin/upload` | ACTIVE | `calendar-stamp-media-api.ts#calendarStampMediaUploadApi()` |
| `/api/calendar-stamp-admin/png-sequence` | ACTIVE | `calendar-stamp-admin-api.ts#calendarStampPngSequenceAdminApi()` |

### Family AI

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/api/family-ai/query` | ACTIVE | `family-ai.ts#familyAiQuery()` |
| `/api/family-ai/plan` | ACTIVE | `family-ai.ts#familyAiPlan()` |
| `/api/family-ai/execute` | ACTIVE | `family-ai.ts#familyAiExecute()` |
| `/api/family-ai/connection-test` | ACTIVE | `family-ai.ts#familyAiConnectionTest()` |
| `/api/family-ai/model-probe` | ACTIVE | `family-ai.ts#familyAiModelProbe()` |
| `/api/family-ai/model-catalog` | ACTIVE | `family-ai.ts#familyAiModelCatalog()` |
| `/api/family-ai/model-compatibility` | ACTIVE | `family-ai.ts#familyAiModelCompatibility()` |
| `/api/family-ai/model-select` | ACTIVE | `family-ai.ts#familyAiModelSelect()` |
| `/api/family-ai/model-reset` | ACTIVE | `family-ai.ts#familyAiModelReset()` |

### Google and calendar import

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/api/google-tasks/action` | ACTIVE | `google-tasks.ts#googleTasksAction()` |
| `/api/google-calendar/sync` | ACTIVE | outbound-only `google-calendar-one-way.ts#calendarSyncOutboundOnly()` |
| `/api/google-calendar/backfill` | ACTIVE | `google-calendar.ts#calendarBackfill()` |
| `/api/google-calendar/disconnect` | ACTIVE | `google-calendar.ts#calendarDisconnect()` |
| `/api/google-calendar/retry-failed` | ACTIVE | `google-calendar.ts#calendarRetryFailed()` |
| `/api/google-calendar/inbound-calendars` | ACTIVE | `google-calendar-inbound-preview.ts#googleCalendarInboundCalendars()` |
| `/api/google-calendar/inbound-preview` | ACTIVE | `google-calendar-inbound-preview.ts#googleCalendarInboundPreview()` |
| `/api/google-calendar/inbound-apply` | ACTIVE | `google-calendar-inbound-apply.ts#googleCalendarInboundApply()` |
| `/api/calendar-import/preview` | ACTIVE | `calendar-ics-import.ts#calendarImportPreview()` |
| `/api/calendar-import/normalization-preview` | ACTIVE | `calendar-ics-import.ts#calendarImportNormalizationPreview()` |
| `/api/calendar-import/prepare` | ACTIVE | `calendar-ics-import.ts#calendarImportPrepare()` |
| `/api/calendar-import/status` | ACTIVE | `calendar-ics-import.ts#calendarImportStatus()` |
| `/api/calendar-import/apply` | ACTIVE | `calendar-ics-import.ts#calendarImportApply()` |
| `/api/calendar-import/rollback` | ACTIVE | `calendar-ics-import.ts#calendarImportRollback()` |

### Settings, PWA and push

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/api/settings/diagnostics-detail` | ACTIVE | `settings-ai-diagnostics.ts#settingsDiagnosticsDetailWithMorningAi()` |
| `/api/settings` | ACTIVE | `settings-root.ts#settings()` |
| `/api/pwa-branding` | ACTIVE | `family-pwa-branding.ts#familyPwaBrandingApi()` |
| `/api/pwa-icon` | ACTIVE | `family-pwa-branding.ts#familyPwaIconApi()` |
| `/api/push/subscribe` | ACTIVE | `web-push-api.ts#webPushApi()` |
| `/api/push/unsubscribe` | ACTIVE | `web-push-api.ts#webPushApi()` |
| `/api/push/test` | ACTIVE | `web-push-api.ts#webPushApi()` |

## Authenticated page routes

Owner: `src/page-routes.ts` unless otherwise noted.

### Auth, onboarding and home

| URL | Class | Canonical handler / destination |
| --- | --- | --- |
| `/login.php`, `/login`, `/login_error.php` | ACTIVE aliases | `auth-page-handlers.ts#loginPage()` |
| `/app/create.php`, `/app/create` | ACTIVE aliases | `auth-page-handlers.ts#createFamilyPage()` |
| `/app/join.php`, `/app/join` | ACTIVE aliases | invite page when token exists; otherwise family-create page |
| `/family/create.php`, `/family/create` | ACTIVE aliases | `createFamilyPage()` |
| `/family/join.php`, `/family/join` | ACTIVE aliases | `invitePage()` |
| `/`, `/index.php`, `/app/index.php` | ACTIVE aliases | `auth-page-handlers.ts#home()` |

### Core pages

| URL | Class | Canonical handler / destination |
| --- | --- | --- |
| `/app/tasks.php` | ACTIVE | `task-page-handlers.ts#taskEvents()` |
| `/app/calendar.php` | ACTIVE | `calendar-page-handler.ts#calendar()` |
| `/app/messages.php` | ACTIVE | `message-page-handlers.ts#messages()` |
| `/app/location.php` | ACTIVE | `location-page.ts#locationPage()` |
| `/app/family_log.php` | ACTIVE | `family-log-page-handler.ts#familyLog()` |
| `/app/settings_family_log.php` | COMPAT alias | same `familyLog()` handler |
| `/app/child_journal.php` | ACTIVE | `child-journal.ts#childJournalPage()` |
| `/app/family_journal.php` | ACTIVE | `family-daily-journal-ai-page.ts#familyDailyJournalPageWithAi()` |
| `/app/family_log_import.php` | ACTIVE | `family-log-piyolog-import-page.ts#familyLogPiyologImportPage()` |
| `/app/calendar_import.php` | ACTIVE | `calendar-ics-import.ts#calendarImportPage()` |
| `/app/message_new.php` | ACTIVE | `message-page-handlers.ts#messageNew()` |
| `/app/shopping_new.php` | ACTIVE | `shopping-page-handlers.ts#shoppingNew()`; internal return path is canonical checklist |
| `/task/view.php` | ACTIVE | `task-page-handlers.ts#taskView()` |
| `/task/edit.php` | ACTIVE | hierarchy guard, then `task-page-handlers.ts#taskEdit()` |
| `/item/edit.php` | ACTIVE | `task-page-handlers.ts#itemEdit()` |
| `/app/shopping_edit.php` | ACTIVE | `shopping-page-handlers.ts#shoppingEdit()` |

### Settings/admin pages

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/app/settings.php` | ACTIVE | `settings-page-handlers.ts#settings()` |
| `/app/settings_pwa_branding.php` | ACTIVE | `settings-pwa-branding-page.ts#settingsPwaBranding()` |
| `/app/settings_location.php` | ACTIVE | `settings-page-handlers.ts#settingsLocation()` |
| `/app/settings_google_tasks.php` | ACTIVE | `google-tasks.ts#googleTasksSettings()` |
| `/app/settings_google_home.php` | ACTIVE | `google-home-execute-diagnostics.ts#googleHomeSettingsWithExecuteDiagnostics()` |
| `/app/settings_integrations.php` | ACTIVE | `google-calendar.ts#integrationsSettings()` |
| `/app/settings_content.php` | ACTIVE | `settings-page-handlers.ts#settingsContent()` |
| `/app/settings_diagnostics.php` | ACTIVE | `settings-page-handlers.ts#settingsDiagnostics()` |
| `/app/settings_members.php` | ACTIVE | `settings-page-handlers.ts#settingsMembers()` |
| `/app/settings_notifications.php` | ACTIVE | `settings-page-handlers.ts#settingsNotifications()` |
| `/app/settings_recurring.php` | ACTIVE | `settings-page-handlers.ts#recurring()` |
| `/app/logs.php` | ACTIVE | `activity-log-page.ts#logsPage()` |

### PWA dynamic routes

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/manifest.webmanifest` | ACTIVE | `family-pwa-branding.ts#familyPwaManifest()` |
| `/app-icon-180.png` | ACTIVE | `family-pwa-branding.ts#familyPwaIcon()` |
| `/app-icon-192.png` | ACTIVE | `family-pwa-branding.ts#familyPwaIcon()` |
| `/app-icon-512.png` | ACTIVE | `family-pwa-branding.ts#familyPwaIcon()` |

## Direct compatibility redirects in page routes

These URLs have no standalone renderer. They are retained as compatibility entrances only.

| URL | Class | Canonical destination |
| --- | --- | --- |
| `/today.php` | COMPAT | `/app/tasks.php?date=<family today>` |
| `/tomorrow.php` | COMPAT | `/app/tasks.php?date=<family tomorrow>` |
| `/app/shopping.php` | COMPAT | `/app/tasks.php?date=<date>#shopping-checklist` |

Current internal Home, Shopping create and Shopping edit flows do not need to traverse `/app/shopping.php`; it remains an external/old-link compatibility entrance.

## Exceptional and compatibility routes

Owner: `src/exception-routes.ts`. This module is mixed `ACTIVE` + `COMPAT` + `EXTERNAL`; it must never be classified as a dead legacy module as a whole.

### Early authenticated route

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/app/recurring.php` | ACTIVE | early-auth `recurring-page.ts#recurring()` |

This path intentionally runs before the standard `makeContext()` flow so unauthenticated recurring requests can be converted to a login redirect rather than an exception path.

### Authenticated OAuth / LIFF prelude

| URL | Class | Canonical handler |
| --- | --- | --- |
| `/oauth/google/authorize` | EXTERNAL | `google-home.ts#googleAuthorize()` wrapped by `preserveGoogleHomeLogin()` |
| `/oauth/google-tasks/authorize` | EXTERNAL | `google-tasks.ts#googleTasksAuthorize()` |
| `/oauth/google-calendar/authorize` | EXTERNAL | `google-calendar.ts#googleCalendarAuthorize()` |
| `/oauth/google-calendar/inbound/authorize` | EXTERNAL | `google-calendar-inbound-auth.ts#googleCalendarInboundAuthorize()` |
| `/app/api/liff_login.php`, `/app/api/liff_login` | EXTERNAL/COMPAT aliases | `liff-login.ts#liffLogin()` |

### Fallback routes

| URL | Class | Canonical handler / destination |
| --- | --- | --- |
| `/app/api/liff_config_diagnose.php`, `/app/api/liff_config_diagnose` | DIAGNOSTIC aliases | `runtime-diagnostics.ts#liffConfigDiagnose()` |
| `/app/api/check.php`, `/app/api/check` | COMPAT | canonical `toggle-api.ts#toggle()` |
| `/app/api/reorder.php`, `/app/api/reorder` | COMPAT | `reorder-api.ts#reorderApi()` |
| `/webhook`, `/app/api/webhook`, `/app/api/webhook.php` | EXTERNAL aliases | `line-webhook.ts#webhook()` |
| `/logout.php`, `/logout` | ACTIVE aliases | local logout/session-cookie clearing response |
| `/task/delete.php` | ACTIVE | `task-delete.ts#taskDelete()` |
| `/task/convert_occurrence.php` | ACTIVE | `recurring-occurrence.ts#convertOccurrence()` |
| `/task/new.php` | ACTIVE | canonical `task-entry-page.ts#taskEntryPage()` |
| `/item/new.php` | ACTIVE | `new-entry-pages.ts#itemNew()` |

`/task/new.php` is specifically **not** evidence that the retired old task-new implementation should exist. The URL is retained as the current canonical task-entry route and points to `task-entry-page.ts`.

## Static asset boundary

`wrangler.jsonc` configures `public/` as the Assets directory with binding `ASSETS` and selected `run_worker_first` URL patterns. Requests not claimed by any dispatcher fall through from `src/index.ts` to `env.ASSETS.fetch(request)`.

Important `run_worker_first` groups include `/`, `/index.php`, legal/PWA routes, `/api/*`, `/oauth/*`, `/app/calendar.php`, `/app/api/*`, `/__cf/*`, login paths and LIFF paths. This configuration is part of route reachability evidence and must be checked before deleting public assets or assuming a URL bypasses the Worker.

## Scheduled execution graph

`wrangler.jsonc` supplies the cron triggers; `src/index.ts#scheduled()` maps each exact cron string to work.

| Cron | Current scheduled work |
| --- | --- |
| `3,8,13,18,23,28,33,38,43,48,53,58 * * * *` | `processGoogleTasksInbound()` |
| `*/5 * * * *` | notifications; LINE daily digest; LINE periodic digest; Google Calendar outbound; Google Calendar inbound auto; Child Journal Calendar outbox |
| `17 * * * *` | notification lifecycle cleanup; Family Log diagnostics cleanup; location-arrival cleanup; location-history archive -> Family Daily Journal -> Family Daily Journal AI |
| `29 18 * * *` | notification lifecycle audit |
| `7,37 * * * *` | Google Calendar watch renewal |

Cron strings are infrastructure scheduling contracts. They are not family wall-clock timezone configuration.

## Development lookup rule

For any route-related change:

1. start from `src/index.ts` dispatch order;
2. locate the exact owning route table above;
3. read the exact current handler and its regression contracts;
4. check `wrangler.jsonc` for Worker-first/static-asset behavior;
5. for callbacks/webhooks/OAuth/LIFF, assume external reachability until explicitly disproven;
6. for aliases, distinguish a live compatibility contract from an actually dead route;
7. update this map when canonical ownership changes.

This map is designed to answer “which URL reaches which owner?” without requiring a full-repository rediscovery, while still requiring exact current-source reads before implementation.
