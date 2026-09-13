# Google Tasks ownership map

Verified against main `399ae858d72f16687e2727aa03663dea1e647848`.

This map records the current Google Tasks runtime ownership boundaries. Historical Wave documents remain useful setup/history references, but current source, migrations and active regression contracts are authoritative.

## Canonical boundaries

| Concern | Canonical owner / exported function | Route / caller | Data / side effects | Regression boundary |
| --- | --- | --- | --- | --- |
| OAuth/account/list settings | `src/google-tasks.ts` (`googleTasksAuthorize()`, `googleTasksCallback()`, `googleTasksSettings()`, `googleTasksAction()`) | `/oauth/google-tasks/authorize` via `src/exception-routes.ts`; `/oauth/google-tasks/callback` via `src/public-routes.ts`; `/app/settings_google_tasks.php` via `src/page-routes.ts`; `/api/google-tasks/action` via `src/context-api-routes.ts` | owns per-member Google Tasks authorization, encrypted refresh token/account state, task-list selection, PRIVATE/FAMILY import visibility, manual sync and revoke state in `external_google_task_accounts` | route dispatcher contracts plus `google-integrations` feature contracts |
| Scheduled inbound polling | `src/google-tasks.ts#processGoogleTasksInbound()` | `src/index.ts` on the dedicated Google Tasks cron cadence | leases eligible accounts, performs bounded incremental Tasks API reads, maintains cursor/window state and dispatches each external item through `applyGoogleTask()` | index/scheduler contracts plus `google-integrations` regression group |
| Per-item dispatch | `src/google-tasks.ts#applyGoogleTask()` | scheduled/manual sync | dispatch order is deterministic routed checklist command -> typed inquiry -> marked voice command -> ordinary task import. Earlier owners are allowed to claim an external item before ordinary import | Google Tasks routing contract and Google integration contracts |
| Ordinary task import/link | `src/google-tasks.ts#applyGoogleTask()` | fallback path after routed/inquiry/voice handlers decline the item | creates/updates canonical `tasks`, assignee state and `external_google_task_links`; external deletion becomes TOMBSTONE, local-edit divergence becomes CONFLICT; imported rows use all-day due dates and `calendar_visible=0` | Google integration feature contracts; Wave115 schema is persistence foundation |
| Deterministic checklist routing | `src/google-tasks-routing.ts#parseChecklistRoute()`, `applyChecklistRoute()` | first owner consulted by `applyGoogleTask()` | explicit grammar only; create-once routing to canonical TASK/SHOPPING/ITEM state through `google_tasks_routes`; ambiguity/quantity/date conflicts become review instead of AI guessing | `scripts/google-tasks-routing-contract.mjs` |
| Marked voice command execution | `src/google-tasks.ts` voice-command parser/apply path | `applyGoogleTask()` after routed checklist and inquiry paths decline | executes bounded marked commands and records exactly-once/review/error receipts in `external_google_voice_commands`; supported command types evolved beyond the original Wave116 schema | `google-integrations` feature contracts and voice-command contracts in the active suite |
| Typed inquiry envelope | `src/google-tasks-inquiry-command.ts#executeGoogleTasksInquiryCommand()` | `applyGoogleTask()` before generic marked voice command execution | revalidates active account/member tenant integrity; uses `external_google_voice_commands` as exactly-once ledger; delegates canonical visibility-aware reads, movement inquiry and push delivery without duplicating domain queries | `google-voice-inquiry-gemini-fallback-contract.mjs` plus Google integration contracts |
| Child Journal voice delegation | `src/child-journal-google-tasks.ts#recordExternalChildJournalGoogleTasksDomain()` | marked Google Tasks voice-command path in `src/google-tasks.ts` | validates BABY/CHILD subject and bounded measurement/memo input, then writes canonical `family_logs` plus `family_log_journal_entries`; activity log marks `google_tasks_child_journal` source | Child Journal / Google integration contracts |
| Shared credential crypto dependency | `src/google-tasks.ts` imports token encryption/decryption helpers from `src/google-calendar.ts` | OAuth/token storage/access-token refresh | implementation dependency only. Google Tasks account/list/sync ownership remains separate from Google Calendar calendar-account/projection ownership | config/integration contracts |

## Persistence lineage

Current Google Tasks state is the result of several migrations; do not infer ownership from only the first Wave document.

- `migrations/0038_wave115_google_tasks_voice_inbox.sql` creates per-member `external_google_task_accounts` and ordinary-import `external_google_task_links`.
- `migrations/0039_wave116_google_tasks_cursor_commands.sql` adds resumable sync cursor fields and the initial `external_google_voice_commands` receipt ledger.
- `migrations/0044_google_voice_command_types.sql` expands the voice-command type set, including completion and inquiry receipts.
- `migrations/0046_google_voice_shopping_add_idempotency.sql` protects corrected/retried shopping voice commands from duplicate side effects.
- `migrations/0070_google_tasks_routing.sql` creates `google_tasks_routes` and links routed commands to canonical tasks. Its own comment explicitly distinguishes routed create-once commands from ordinary task sync.

## Ownership rules

- Google Tasks is an **inbound bridge**, not a second canonical task store. Canonical TASK/SHOPPING/ITEM/Family Log/Child Journal state remains owned by those FamilyToDo domains after guarded delegation.
- `external_google_task_links`, `external_google_voice_commands` and `google_tasks_routes` have different semantics. Do not merge them into one generic external-task table or bypass their separate idempotency/conflict rules.
- `applyGoogleTask()` claim order is significant: deterministic routed commands are checked first, typed inquiries second, marked voice commands third, and ordinary task import last. Reordering can cause one Google item to be consumed by the wrong owner or duplicated.
- Checklist routing deliberately avoids AI guessing. Ambiguous date/quantity/instruction inputs go to review; ordinary titles and existing legacy-owned IDs are released to the pre-existing importer.
- Inquiry execution must retain tenant revalidation and exactly-once delivery semantics. Outcome-ambiguous delivery failures are not freely retried because that could duplicate notifications.
- Imported ordinary tasks are PRIVATE unless the linked account explicitly opts into FAMILY visibility. Routing uses the same account visibility boundary when creating canonical rows.
- Google Tasks due values are date/all-day input. Do not invent a time-of-day or use this bridge as a substitute for timed Google Calendar events.
- Child Journal recording through Google Tasks is an adapter into canonical Family Log/Journal persistence; it is not a separate journal store.
- Google Tasks can fall back to Google Calendar OAuth credential/token-key configuration, and currently reuses calendar token crypto helpers. That code reuse does not make Google Calendar the owner of Google Tasks sync/account semantics.
- `docs/GOOGLE_TASKS_VOICE_BRIDGE_WAVE115.md` and `docs/GOOGLE_TASKS_VOICE_COMMANDS_WAVE116.md` describe historical setup/wave behavior. Use this map plus current source for present ownership decisions.
- A zero-result repository search is not proof that a source or contract is absent. Classify a component DEAD only after direct runtime/build/contract reachability evidence.
