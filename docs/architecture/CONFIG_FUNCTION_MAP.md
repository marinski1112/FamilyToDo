# Config and function ownership map

Verified against current structural baseline `09ea97dd194dcfa1c814b78e85849b0e65ffe86d`.

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

The authenticated API dispatcher for this domain is `src/context-api-routes.ts`. It owns the canonical `/api/task`, `/api/task-children`, `/api/task-rough-input`, `/api/item`, and `/api/toggle` wiring; `src/page-routes.ts` owns the canonical task edit page wiring; feature modules own behavior below those routing boundaries.

| Concern | Canonical owner / exported function | Route/caller | Data / external side effects | Authorization / visibility boundary | Regression boundary |
| --- | --- | --- | --- | --- | --- |
| Task create/delete | `src/task-api.ts#taskApi()` | `POST` / `DELETE /api/task` via `src/context-api-routes.ts` | create owns task persistence plus task assignees and may persist linked `shopping_items` / `items` and notifications; delete archives/removes task, linked Item/Shopping completion state and recurrence occurrences; both mutation paths queue Google Calendar projection and the create path wakes the calendar outbox | authenticated member + CSRF; delete also requires OWNER/ADMIN or task creator; task access is filtered through canonical `taskVisibilitySql()`; PRIVATE create carries `visibility_scope` / `private_owner_id` and owner-only assignee semantics | `task-api-modularity-contract.mjs`, `task-visibility-boundary-contract.mjs`, `context-api-route-dispatcher-contract.mjs`, `task-delete-modularity-contract.mjs` |
| Existing Task/Event edit | `src/task-edit-page.ts#taskEdit()` | `GET` / `POST /task/edit.php?id=...` via `src/page-routes.ts`, after `validateTaskEditRequestHierarchy()` | updates task schedule/visibility/reminder/assignees and reconciles linked Shopping/Item assignees and completion state; linked child rows may be added/updated/archived; queues Google Calendar projection after save | authenticated member; task lookup uses `taskVisibilitySql()`; edit requires OWNER/ADMIN or creator; CSRF required on POST; PRIVATE conversion is restricted and visibility-sensitive linked activity is cleaned | `task-edit-page-boundary-contract.mjs`, `page-route-dispatcher-contract.mjs`, `task-visibility-boundary-contract.mjs` |
| Task hierarchy validation/persistence | `src/task-hierarchy.ts#validateTaskParentLink()` consumed by `src/task-api.ts#taskApi()` | explicit `parent_task_id` on `/api/task` create | nullable `tasks.parent_task_id`; no automatic recurrence, assignee, Shopping, Item, or completion inheritance | same-family parent; one shallow level; FAMILY/PRIVATE visibility parity; PRIVATE owner parity; self/cross-family/deeper links rejected | `task-hierarchy-foundation-contract.mjs`, `task-api-modularity-contract.mjs` |
| Task child read model | `src/task-children-api.ts#taskChildrenApi()` | `GET /api/task-children?parent_id=...` | reads parent/child `tasks`, active `task_assignees` and `members`; returns child status, schedule, assignees, completion mode and edit/add capability | authenticated member; parent and each child use `taskVisibilitySql()`; add/edit capability is OWNER/ADMIN or creator and child addition is limited to top-level parents | `context-api-route-dispatcher-contract.mjs`, `task-visibility-boundary-contract.mjs`, `task-hierarchy-foundation-contract.mjs` |
| Item creation/linking | `src/item-api.ts#itemApi()` | `POST /api/item` via `src/context-api-routes.ts` | inserts `items` and `item_assignees`; optional task linkage remains explicit on the item | authenticated member + CSRF; linked task lookup uses `taskVisibilitySql()`; PRIVATE task linkage preserves private-owner assignment semantics | `item-api-modularity-contract.mjs`, `task-visibility-boundary-contract.mjs`, `context-api-route-dispatcher-contract.mjs` |
| Task / recurrence / Item / Shopping completion | `src/toggle-api.ts#toggle()` | canonical `/api/toggle`; COMPAT `/app/api/check.php` and `/app/api/check` reuse the same function | owns per-member completion ledgers and completion history for task/item/Shopping/recurrence; task completion also writes activity state; recurrence aggregate compatibility is delegated to `src/recurrence-completion-state.ts` | authenticated member + CSRF; assigned entities require the acting assignee; unassigned entities remain completable by an active family member; Item/Shopping may inherit task assignees when they have no direct assignees; task visibility is enforced through `taskVisibilitySql()` | `toggle-api-boundary-contract.mjs`, `recurrence-toggle-authorization-order-contract.mjs`, `recurrence-overdue-invariant-contract.mjs`, `task-visibility-boundary-contract.mjs`, `exception-route-dispatchers-contract.mjs` |
| AI rough-input analysis | `src/task-rough-input-api.ts#taskRoughInputApi()` and trusted-server `analyzeTaskRoughInput()` | `POST /api/task-rough-input`; dispatcher first applies `normalizeEventRoughInputRequest()` | analysis only: deterministic parsing/validation plus bounded Gemini primary/fallback when required; optional public product-link preview; AI generation diagnostics and request/cost guard. Persistence authority remains with the normal task/Shopping/Item mutation owners | authenticated member; browser API requires CSRF; model output is provenance-validated and cannot change the requested destination; trusted-server callers may provide already-authorized context | `task-rough-input-ai-cost-guard-contract.mjs`, `task-rough-input-product-link-contract.mjs`, `task-rough-input-multi-url-split-contract.mjs`, `task-rough-input-shared-deadline-contract.mjs`, `task-rough-input-multiplier-dimension-contract.mjs`, `context-api-route-dispatcher-contract.mjs` |

### Task-domain cleanup rules

- Do not merge create/delete and edit ownership merely because both mutate `tasks`. `/api/task` create/delete and `/task/edit.php` existing-row edit currently have distinct owners and side-effect orchestration.
- Do not move completion writes into page renderers. `toggle()` is the canonical completion mutation boundary for task, recurrence, Item, and Shopping state.
- Do not treat `/app/api/check.php` as a second completion implementation. It is a COMPAT route alias that delegates to the same `toggle()` owner.
- Do not infer parent-child inheritance that is not explicit in current source. A child remains its own task row; recurrence, assignees, linked Shopping/Items, and completion state are not implicitly inherited from the parent.
- Do not bypass `taskVisibilitySql()` when adding task-linked reads or mutations. PRIVATE visibility and owner identity are part of the domain contract, not page-only filtering.
- `taskRoughInputApi()` analyzes and validates input; it does not replace canonical persistence owners. AI output must continue through the normal task/Shopping/Item save paths.

## Message ownership

`src/messages-api.ts#messages()` is intentionally both the canonical `/app/messages.php` page handler and the canonical `/api/messages` mutation handler. `src/message-new-page.ts#messageNew()` is a separate create-form page only; it submits into the same messages API rather than owning message persistence.

| Concern | Canonical owner / exported function | Route/caller | Data / external side effects | Authorization / tenant boundary | Regression boundary |
| --- | --- | --- | --- | --- | --- |
| Message list + create/edit/delete | `src/messages-api.ts#messages()` | `/app/messages.php` via `src/page-routes.ts`; `/api/messages` via `src/context-api-routes.ts` | reads/writes `messages`; create/edit schedules `message_reminder` rows in `notifications`; edit/delete cancels pending/retry notifications; edit/delete activity is recorded | authenticated member + CSRF on POST; target member is validated active and same-family; edit/delete require sender or OWNER/ADMIN; recipient display JOIN remains family-scoped | `messages-api-boundary-contract.mjs`, `context-api-route-dispatcher-contract.mjs`, `page-route-dispatcher-contract.mjs` |
| New-message form | `src/message-new-page.ts#messageNew()` | `GET /app/message_new.php` | reads active family members and renders `message-new.js`; no message persistence owner | authenticated member; recipient choices are family-scoped; CSRF token is embedded for the API submission | `message-new-page-boundary-contract.mjs`, `page-route-dispatcher-contract.mjs` |
| AI conversion draft | `src/message-ai-draft.ts#messageAiDraft()` | `action=ai_draft` through `POST /api/messages` | read-only: reads one family message and bounded active FAMILY task candidates, then reuses `analyzeTaskRoughInput()`; returns suggestions with `requiresConfirmation=true`; no Task/Shopping/message conversion mutation | authenticated member; message lookup is family-scoped; candidate tasks are FAMILY, incomplete, non-recurring; reference date uses family timezone fallback chain | `messages-api-boundary-contract.mjs` plus the active task rough-input regression contracts that guard the reused analyzer |
| Message -> Shopping conversion | `src/messages-api.ts#messages()` `action=convert_shopping` | confirmed conversion through `POST /api/messages` | inserts `shopping_items` and `shopping_assignees`, records `messages.converted_to_shopping_id`, logs conversion; optional task link accepts only active FAMILY non-recurring task | authenticated member + CSRF; assignees/target member must be active same-family; stale AI draft is rejected by message updated/text checks; already-converted message is idempotently returned | `messages-api-boundary-contract.mjs`, Shopping contracts for downstream active surfaces |
| Message -> Task/Event conversion | `src/messages-api.ts#messages()` `action=convert_task` | confirmed conversion through `POST /api/messages` | existing mode may append message text to an active FAMILY task; new mode creates Task/Event, assignees and reminders; records `messages.converted_to_task_id`, logs conversion and queues Google Calendar projection | authenticated member + CSRF; existing target is active FAMILY non-recurring; assignees are active same-family; stale AI draft is rejected; already-converted message is idempotently returned | `messages-api-boundary-contract.mjs`, task range/Calendar behavior retained by the current handler and downstream Task contracts |

### Message-domain cleanup rules

- Do not split page and API behavior by assuming `/app/messages.php` and `/api/messages` have different business owners. Both intentionally delegate to `messages()` today.
- Do not move persistence into `messageNew()`. It is a server-rendered form surface; the canonical message mutation path is `/api/messages`.
- `messageAiDraft()` is advisory/read-only. It may reuse the Task rough-input analyzer and rank nearby tasks, but conversion still requires a confirmed `convert_task` / `convert_shopping` action through `messages()`.
- Preserve the message version/text stale-draft guard before confirmed conversion; it prevents an AI draft generated from an older message body from being persisted after the source message changes.
- Message conversion currently accepts FAMILY task targets only. Do not broaden it to PRIVATE targets by reusing generic Task access helpers without an explicit product/privacy decision.
- `/api/message-stamps` is a separate canonical owner (`src/message-stamp-api.ts`) and is not part of the `messages()` persistence boundary.

## Family Log ownership

Family Log intentionally has several canonical boundaries instead of one monolithic owner. `src/family-log-page-handler.ts#familyLog()` is the page-method dispatcher: GET delegates to the read/render owner `familyLogPage()`, while page POST delegates to the same guarded mutation boundary used by `/api/family-log`. `familyLogMutationBoundary()` adds request-level validation and lifecycle hooks, but the canonical action/business mutation owner remains `familyLogApi()`.

| Concern | Canonical owner / exported function | Route/caller | Data / external side effects | Authorization / tenant/privacy boundary | Regression boundary |
| --- | --- | --- | --- | --- | --- |
| Family Log page/read model | `src/family-log-page-handler.ts#familyLog()` -> `src/family-log-page.ts#familyLogPage()` | `GET /app/family_log.php` and `/app/settings_family_log.php` via `src/page-routes.ts` | reads Family Log subjects/settings/history, recurrence-linked projections and FAMILY-visible task context; emits server payload consumed by scoped Family Log assets | authenticated family context; family-scoped reads; task-linked reads retain FAMILY visibility rules; page controls do not own direct history mutation | `family-log-page-boundary-contract.mjs`, `page-route-dispatcher-contract.mjs` |
| HTTP mutation guard/lifecycle | `src/family-log-mutation-boundary.ts#familyLogMutationBoundary()` | `POST /api/family-log` via `src/context-api-routes.ts`; page POST via `familyLog()` | delegates business mutation to `familyLogApi()`; rejects nonexistent calendar dates after valid CSRF; coordinates media cleanup/revalidation after delete/save/subject update; adds tenant-aware audit handling for quick-action disable | authenticated context inherited from app routing; CSRF/date guard precedes canonical mutation; quick-action disable independently requires OWNER/ADMIN and same-family quick-action lookup | `family-log-api-boundary-contract.mjs`, `family-log-media-contract.mjs`, `family-log-page-boundary-contract.mjs` |
| Canonical Family Log mutations | `src/family-log-api.ts#familyLogApi()` | invoked through `familyLogMutationBoundary()` for normal POST mutation flow | owns subject/settings, quick chore/action/record, ordinary save/delete, timer/sleep lifecycle and linked-target completion orchestration; writes Family Log domain tables/activity and requests Google Home sync where current actions require it | authenticated member + CSRF; every entity lookup/mutation is family-scoped; OWNER/ADMIN or delegated permission is enforced for management actions; subject/member linkage remains same-family | `family-log-api-boundary-contract.mjs`, `family-log-page-boundary-contract.mjs` |
| Linked Task/recurrence completion service | `src/family-log-linked-completion.ts#completeLinkedTargetFromFamilyLog()` | called after eligible Family Log saves and by recurrence Family Log creation | writes task or recurrence per-member completion ledgers, ordinary task completion history, recurrence aggregate compatibility state, notification cancellation when ordinary task becomes completed, and privacy-safe activity projection | caller owns Family Log persistence/auth; service enforces same-family target lookup and assignee authorization; EVENT is not auto-completed; unassigned targets do not silently assign the recorder | `family-log-linked-completion-boundary-contract.mjs`, completion/recurrence contracts |
| Recurrence occurrence -> Family Log record | `src/family-log-occurrence-api.ts#recordOccurrenceFamilyLog()` | `POST /api/recurrence/family-log-complete` via `src/context-api-routes.ts` | creates at most one active `family_logs` row per template/occurrence/recorder and then delegates completion to `completeLinkedTargetFromFamilyLog()`; failed linked completion compensates a newly created log by soft-delete | authenticated member + CSRF; occurrence/rule/task/template are family-scoped; EVENT excluded; configured subject must remain active and support the log type; assigned recurrence requires recorder to be an assignee | `family-log-occurrence-api-boundary-contract.mjs`, `family-log-linked-completion-boundary-contract.mjs` |
| Private Family Log media | `src/family-log-media-api.ts#familyLogMediaApi()` plus reconcile/cleanup helpers | `/api/family-log-media` via `src/context-api-routes.ts`; mutation/import boundaries invoke lifecycle helpers | private R2 `MEDIA` bytes + `family_log_media` metadata and durable cleanup queue; one eligible photo per supported parent; save/delete/subject/import changes trigger reconciliation | active same-family member gate; mutation CSRF; parent/log/subject joins are family-scoped; bytes limited to JPEG/PNG/WebP <=4 MiB with signature checks; storage keys are never exposed in public JSON/logs | `family-log-media-contract.mjs`, `family-log-baby-food-photo-ui-contract.mjs` |
| Family Log import core | `src/family-log-import.ts#familyLogImportApi()` wrapped by `src/family-log-import-media-boundary.ts#familyLogImportMediaBoundary()` | `POST /api/family-log-import`; visible controller `/app/family_log_import.php` | bounded preview/chunk/finish/status/rollback and historical repair flows write `family_log_import_batches`, imported `family_logs` and repair state; successful import marks media for revalidation and drains actionable cleanup | OWNER/ADMIN + CSRF; import subject/batch/log lookups are family-scoped; body/record/chunk/bind counts are bounded; source timestamps are normalized with family timezone; duplicate keys prevent silent duplicate import | `family-log-piyolog-import-contract.mjs`, `family-log-media-contract.mjs`, duplicate-preview/import contracts |

### Family-Log cleanup rules

- Do not collapse `familyLogMutationBoundary()` into `familyLogApi()` merely because both participate in POST handling. The boundary intentionally owns pre-dispatch real-date validation, media lifecycle coordination and a tenant/audit guard; `familyLogApi()` remains the canonical action/business mutation owner.
- Do not move Family Log completion logic into page JavaScript or duplicate `/api/toggle`. `completeLinkedTargetFromFamilyLog()` is a distinct service because a Family Log record is the source of the completion projection, while Task/recurrence completion semantics and assignee rules still have to remain canonical.
- Do not treat `/app/settings_family_log.php` as an obsolete duplicate page without a product decision. It currently routes to the same active Family Log page owner and exposes management mode expected by current assets/contracts.
- Keep media bytes private. R2 storage keys, source filenames/identifiers and raw image content must not become public API/log fields; access continues through the authenticated Family Log media proxy.
- Import is an administrative ingestion boundary, not a second live Family Log editor. Preserve preview/bounded chunking/duplicate detection/rollback and the post-import media reconciliation wrapper when refactoring.
- Child Journal (`/app/child_journal.php`, `/api/child-journal`), Family Journal (`/app/family_journal.php`) and journal AI generation are separate mapped domains even when they project or consume Family Log records. Do not merge their ownership into the base Family Log mutation boundary by name alone.

## Child Journal / Family Journal ownership

Child Journal reuses Family Log storage and media infrastructure, but it has its own read/mutation owner and integration boundaries. Family Daily Journal is a separate aggregation/presentation domain again: its deterministic generator consumes current Task/Family Log/location projections, while AI generation and AI presentation/privacy checks remain distinct layers.

| Concern | Canonical owner / exported function | Route/caller | Data / external side effects | Authorization / tenant/privacy boundary | Regression boundary |
| --- | --- | --- | --- | --- | --- |
| Child Journal page/read | `src/child-journal.ts#childJournalPage()` | `GET /app/child_journal.php` via `src/page-routes.ts` | reads Child Journal entries from canonical `family_logs` + `family_log_journal_entries` projection and journal-capable subjects | authenticated family context; reads remain family/subject scoped | `child-growth-journal-contract.mjs`, `page-route-dispatcher-contract.mjs` |
| Child Journal business mutation | `src/child-journal.ts#childJournalApi()` | `/api/child-journal` via `src/context-api-routes.ts` | creates/updates/deletes Child Journal domain entries using `family_logs` plus `family_log_journal_entries`; Child Journal mutation ownership does not move to `familyLogApi()` merely because storage is shared | authenticated member + CSRF; subject/log lookups are same-family and journal-subject scoped | `child-growth-journal-contract.mjs`, `context-api-route-dispatcher-contract.mjs` |
| Shared Family Log media boundary | `src/family-log-media-api.ts#familyLogMediaApi()` | authenticated `/api/family-log-media` proxy reused by Journal photo flows | private R2 `MEDIA` bytes + `family_log_media` metadata; media transport/lifecycle is shared infrastructure, not Child Journal business mutation ownership | Journal media parent checks retain same-family subject/log, active/non-deleted and supported Journal type constraints; storage keys/raw bytes remain private | `child-journal-photo-contract.mjs`, `family-log-media-contract.mjs` |
| Child Journal schema readiness | `src/child-journal-schema.ts#childJournalSchemaStatus()`, `childJournalFoundationReady()`, `childJournalCalendarReady()` | Child Journal core and external/sync adapters | guards availability of `family_log_journal_entries` and dedicated Child Journal Calendar account/link/outbox tables; no business mutation ownership | readiness only; callers still own auth/tenant checks | Journal core/calendar contracts |
| Child Journal Calendar outbox/sync | `src/child-journal-calendar.ts#processChildJournalCalendarOutbox()` | scheduled dispatcher in `src/index.ts` and Journal Calendar integration paths | dedicated Child Journal Calendar account/link/outbox projection; separate from normal Family Calendar/Event ownership | family-bound Journal calendar state; sync/outbox support does not become Child Journal mutation owner | `child-journal-google-calendar-contract.mjs` |
| Google Tasks -> Child Journal adapter | `src/child-journal-google-tasks.ts#recordExternalChildJournalGoogleTasksDomain()` | trusted Google Tasks routing/integration caller | validates HEIGHT/WEIGHT/MEMO input, writes canonical `family_logs` + `family_log_journal_entries`, and records activity provenance | same-family active BABY/CHILD subject; schema readiness and bounded value/text/time-offset validation | source-backed adapter boundary; no dedicated Child Journal Google Tasks contract identified in the current regression manifest |
| Google Home -> Child Journal adapter | `src/child-journal-google-home.ts#recordExternalChildJournalMilestoneDomain()` | trusted Google Home/voice integration caller | maps supported milestone codes into canonical `family_logs` + `family_log_journal_entries` and activity provenance | same-family active BABY/CHILD subject; schema readiness and fixed milestone allowlist | source-backed adapter boundary; no dedicated Child Journal Google Home contract identified in the current regression manifest |
| Family Daily Journal deterministic generation | `src/family-daily-journal.ts#generateFamilyDailyJournal()` / `generateFamilyDailyJournals()` | scheduled dispatcher in `src/index.ts` | aggregates privacy-eligible location archive, FAMILY task completion facts from `tasks` + `task_completion_history`, and `family_logs` HOUSEWORK rows; excludes `task_kind='EVENT'`; persists `family_daily_journals`; does not read the legacy `events` table | family-scoped aggregation; Task input is FAMILY visibility only; location input requires currently enabled/sharing/non-revoked devices | `family-daily-journal-contract.mjs` |
| Family Daily Journal base page/read | `src/family-daily-journal.ts#familyDailyJournalPage()` | `/app/family_journal.php` through the AI page wrapper | reads `family_daily_journals`, reconstructs safe summaries and filters displayed location facts against members currently sharing location | authenticated same-family member; current location-sharing state is re-read for page/detail/search output | `family-daily-journal-contract.mjs`, page route contracts |
| Family Journal AI generation | `src/family-daily-journal-ai.ts#generateFamilyDailyJournalAi()` | scheduled after deterministic journal generation | generates bounded AI narrative from the persisted deterministic Family Daily Journal input and stores AI result/metadata in `family_daily_journals`; it is not the base journal generator | family/day bounded input; AI output does not replace canonical deterministic source facts | `family-daily-journal-ai-contract.mjs` |
| Family Journal AI presentation/privacy wrapper | `src/family-daily-journal-ai-page.ts#familyDailyJournalPageWithAi()` | `/app/family_journal.php` via `src/page-routes.ts` | wraps `familyDailyJournalPage()` and inserts stored AI narrative only when eligible | rechecks current sharing for every member whose location was included at AI-generation time; stale location-derived AI narrative is suppressed after sharing is revoked | `family-daily-journal-ai-contract.mjs` |
| Scheduled boundaries | `src/index.ts` | Worker `scheduled()` | Child Journal Calendar outbox processing runs on its dedicated 5-minute cadence; Family Daily Journal deterministic generation and then AI generation run as a separate ordered boundary at the hourly `:17` archive/journal stage | schedulers call existing domain owners; they do not merge business ownership across Journal domains | schedule wiring plus the Journal contracts above |
| TEST / CONTRACT manifest | `scripts/regression-manifest.mjs`, Journal contract scripts | `scripts/regression-suite.mjs` / `npm test` | active Child Journal coverage includes `child-growth-journal-contract.mjs`, `child-journal-photo-contract.mjs`, `child-journal-google-calendar-contract.mjs`; Family Daily Journal has `family-daily-journal-contract.mjs` and `family-daily-journal-ai-contract.mjs` | contracts guard domain/storage/privacy/sync boundaries; absence from a code-search result alone is not proof that a boundary is dead | current regression manifest + `package.json` test wiring |

### Journal-domain cleanup rules

- Child Journal and Family Log share canonical storage/media infrastructure, but shared tables or media transport do not make `familyLogApi()` the Child Journal mutation owner. `childJournalApi()` remains the Child Journal business mutation boundary.
- Google Tasks and Google Home modules are external adapters into canonical Child Journal storage, not independent storage owners. Do not create a parallel Journal persistence model for those integrations.
- Child Journal Calendar is a dedicated sync/outbox support owner. Do not merge it into normal Family Calendar/Event ownership or into the Child Journal business mutation path merely because it projects Journal entries.
- Family Daily Journal is not the Child Journal mutation owner. It aggregates already-recorded family facts into `family_daily_journals` and has a separate page/read surface.
- Keep deterministic generation and AI generation separate. `generateFamilyDailyJournal()` owns source-fact aggregation; `generateFamilyDailyJournalAi()` owns the optional narrative layer.
- Keep the base page and AI privacy wrapper separate. `familyDailyJournalPage()` filters current location-sharing facts for the base view; `familyDailyJournalPageWithAi()` additionally suppresses stored AI text when its recorded location-member set is no longer currently shared.
- Family Daily Journal task aggregation is based on `tasks` + `task_completion_history`, excludes EVENT-kind tasks, and does not use the retired `events` table. Do not reintroduce legacy-event reads during Journal cleanup.
- Search/regression discovery is evidence only. A zero-result code search is not sufficient to classify a Journal owner, route, contract or adapter as DEAD.

## Location ownership

Location is an explicitly opt-in provider-neutral domain. Public sensor ingestion, authenticated family reads/management, route-provider calls, bounded history/archive projections, and Journal consumption are separate boundaries; none of them should be collapsed into page JavaScript or Family Log persistence.

| Concern | Canonical owner / exported function | Route/caller | Data / external side effects | Authorization / tenant/privacy boundary | Regression boundary |
| --- | --- | --- | --- | --- | --- |
| Location page/read surface | `src/location-page.ts#locationPage()` plus `src/location-latest-api.ts#locationLatestApi()` | `GET /app/location.php`; `GET /api/location/latest` via page/context dispatchers | renders the map shell and browser-safe family latest projection; uses Google Maps browser configuration but never requests browser geolocation | authenticated family scope; only enabled, sharing, non-revoked device rows are eligible; device/provider credentials and raw provider payloads are not returned | `location-page-boundary-contract.mjs`, `location-latest-api-contract.mjs`, route-dispatcher contracts |
| Provider/domain contract | `src/location-domain.ts`, `src/location-providers.ts` | provider adapters, query/map/route consumers | canonical `NormalizedLocationPoint`; ingest providers are `OWNTRACKS` / `FAMILYTODO_ANDROID`; query/map/route interfaces consume provider-neutral coordinates | sharing defaults fail closed; raw provider JSON is not part of the canonical point contract | source-backed provider boundary; dedicated Android ingress contract not identified in the current regression manifest |
| Device management/provisioning | `src/location-device-api.ts#locationDeviceApi()`, `src/location-device-provisioning.ts#provisionLocationDevice()` | `/api/location/devices` | owns `location_devices`; provisioning returns plaintext secret once, stores only SHA-256 `secret_hash`; sharing enable/revoke are explicit separate actions | authenticated member + CSRF for mutation; self or same-family OWNER/ADMIN; new device starts sharing OFF | `location-device-api-contract.mjs`, `location-device-provisioning-contract.mjs` |
| Device credential verification | `src/location-device-auth.ts#verifyLocationDeviceCredential()` | public sensor ingestion boundary | verifies hashed device credential against active member/device/sharing state | disabled, share-off or revoked devices fail closed; secret is never persisted/read back in plaintext | `location-device-auth-contract.mjs` |
| OwnTracks public ingress | `src/location-owntracks-ingress.ts#ownTracksLocationIngress()` | `POST /api/location/owntracks` via `src/public-routes.ts` | Basic credential -> OwnTracks normalization -> canonical persistence; accepted points may trigger best-effort place alert processing | TLS/HTTP Basic public ID + one-time secret; credentials are not accepted from URL/query; body is bounded and raw request/credentials/coordinates are not logged by this boundary | `location-owntracks-normalizer-contract.mjs`, `location-owntracks-ingress-contract.mjs`, `public-route-dispatcher-contract.mjs` |
| Canonical latest/history persistence | `src/location-persistence.ts#persistAuthenticatedLocationPoint()` | authenticated normalized ingress | writes replay-safe `member_location_history`, forward-only `member_location_latest`, and device `last_seen_at`; canonical dedupe key is derived from normalized fields | identity/sharing/member state is rechecked at mutation time; duplicate/older points cannot roll latest backwards | `location-persistence-contract.mjs` |
| Provider-neutral coordinate reads | `src/location-query-service.ts#D1LocationQueryService` | latest/history APIs, HOME/places, route and notification consumers | bounded latest/history reads from `member_location_latest` / `member_location_history` | proves requester + subject are active same-family and returned rows still belong to enabled, sharing, non-revoked devices; history is bounded | `location-query-service-contract.mjs` plus active Location API contracts |
| History/report/archive | `src/location-history-api.ts`, `src/location-history-archive.ts#archiveLocationHistory()` | `/api/location/history`, `/history-search`, `/stay-address`; hourly `:17` scheduler | reads live bounded history or durable `location_history_archive_days` / `location_history_stays`; archive simplifies route and derives stays | browser reads are authenticated family-scoped and sharing-gated; archive never deletes raw `member_location_history` in current source | `location-long-term-history-contract.mjs`; dedicated archive cleanup/deletion owner is not identified because current archive owner explicitly does not delete raw history |
| HOME / named places / alerts | `src/location-home-api.ts#locationHomeApi()`, `src/location-places-api.ts#locationPlacesApi()`, `src/location-arrival-push.ts#processLocationArrival()` | `/api/location/home`, `/api/location/places`, post-ingress best-effort processing | manages `family_location_places`, named places and bounded arrival/leave state/delivery rows; sends web push on stable place transitions | HOME/place mutation is CSRF protected and admin-scoped where required; coordinates are captured server-side from sharing-enabled latest state, not submitted arbitrarily by browser | `location-report-push-contract.mjs`; HOME/places-specific dedicated contracts not identified in the current active regression manifest |
| On-demand route ETA | `src/location-route-api.ts#locationRouteEtaApi()`, `src/location-google-routes.ts#GoogleRoutesProvider` | `POST /api/location/eta` | resolves origin/destination server-side from fresh sharing-enabled Location state and calls Google Routes `computeRoutes` only on explicit request | authenticated + CSRF; browser cannot submit arbitrary coordinates; server-only key; only distance/duration fields are requested and coordinates are sent in POST body, not URL/log | source-backed route boundary; dedicated route-ETA contract not identified in the current active regression manifest |
| Family Daily Journal Location projection | `src/location-history-archive.ts` -> `src/family-daily-journal.ts#generateFamilyDailyJournal()` | hourly `:17` ordered archive/journal stage | Journal consumes durable archive days/stays rather than raw provider payloads; stores bounded location summary in `family_daily_journals` | generation and presentation require currently enabled/sharing/non-revoked device eligibility; page/AI layers recheck current sharing as mapped above | `family-daily-journal-contract.mjs`, `family-daily-journal-ai-contract.mjs`, `location-long-term-history-contract.mjs` |
| Scheduled Location boundaries | `src/index.ts` | Worker `scheduled()` at hourly `:17` | cleanup of short-lived alert delivery/state rows; `archiveLocationHistory()` then deterministic Daily Journal then AI Journal in order | scheduler calls existing Location/Journal owners; raw Location history retention is not silently deleted | schedule wiring plus Location/Journal contracts above |
| TEST / CONTRACT wiring | `scripts/regression-manifest.mjs`, `package.json` | `scripts/regression-suite.mjs` / `npm test` | active manifest includes page, OwnTracks normalizer/auth/provisioning/persistence/ingress/latest/report-push contracts; package test wiring additionally runs quality diagnostics, long-term history, device API and query-service contracts | contracts guard privacy, tenant, ingest, persistence and history boundaries; zero-result code search is not evidence that a boundary is dead | current regression manifest + `package.json` |

### Location-domain cleanup rules

- Keep public device ingestion separate from authenticated app-context APIs. `/api/location/owntracks` authenticates the registered sensor credential; it must not be converted into a browser/session ingestion path.
- Keep device provisioning and sharing consent separate. Provisioning creates a disabled-for-sharing credential state, and only an explicit later action enables sharing.
- Do not persist raw provider JSON or plaintext device secrets. Provider adapters normalize first; persistence owns only canonical Location fields, and provisioning stores only a hash of the one-time secret.
- Do not bypass `D1LocationQueryService` for user-facing coordinate reads unless a source-backed boundary explicitly owns the same sharing/tenant checks.
- Current long-term history processing archives and simplifies completed days but deliberately leaves raw `member_location_history` intact. Do not describe or implement retention deletion as already-owned behavior without a separate explicit policy/owner.
- HOME/named-place and ETA coordinates are resolved server-side from current sharing-enabled state. Do not add arbitrary browser coordinate submission to those mutation/cost boundaries.
- Google Routes is on-demand and server-only. Do not call it during passive map refresh; the normal latest display uses provider-neutral reads and local straight-line/Haversine calculations where applicable.
- Location-derived Family Daily Journal facts come from durable archive projections and remain subject to current sharing checks. Do not write raw GPS coordinates into Family Log as a shortcut for Journal generation.
- Search/regression discovery is evidence only. A zero-result code search is not sufficient to classify a Location owner, adapter, route or contract as DEAD.

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