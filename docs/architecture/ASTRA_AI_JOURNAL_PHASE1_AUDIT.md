# AI / Google child journal / Family Log phased audit

Baseline: main `4f8e7556d849a46261fa8a37b4c9e1c1bbf76b89`, package
`12.148.0-wave128`. Exact repository clone matched GitHub main. Inventory starts
from the FAMILY_AI / GOOGLE_HOME / GOOGLE_TASKS ownership maps, then reads runtime
owners; repository-wide src search confirmed the Gemini transport call sites below.
No production family data, credentials, prompts or generated bodies were collected.

## A. Actual Gemini generation inventory

Counts are source upper bounds, not measured usage or proof that a configured ID
is available to the production Google project.

| Runtime feature | Exact owner | Baseline model source | Generation requests |
| --- | --- | --- | --- |
| Shared morning recap, personal notes and fortunes | src/line-daily-digest.ts, src/line-daily-digest-ai-guard.ts | MORNING_DIGEST_GEMINI_MODEL_PRIMARY/FALLBACK; defaults gemini-3.8-flash / gemini-3.5-flash | 0–2 per family/day; recipients are generated together, not one AI request per recipient |
| Weekly/monthly recap | src/line-periodic-digest.ts, src/line-periodic-digest-ai-guard.ts | same deployment overrides and 3.8-flash / 3.5-flash defaults | 0–2 per family/report period |
| Family Daily Journal | src/family-daily-journal-ai.ts, src/ai-model-policy.ts | hard-coded gemini-3.7-flash | 1 per candidate; at most 3 candidates/run; failed candidates eligible again after 6 hours |
| Task/event/shopping/item rough input | src/task-rough-input-api.ts | hard-coded 3.5-flash-lite → 3.5-flash | 0–2 per analysis; simple deterministic inputs 0; 429 stops fallback |
| Message → task draft | src/message-ai-draft.ts → analyzeTaskRoughInput | same rough-input models | same 0–2 budgeted path; draft requires confirmation, not a second save-time AI call |
| Interactive Family AI plan/query | src/family-ai.ts, plannerFor/GeminiPlanner | family setting → GEMINI_MODEL → gemini-3.1-flash-lite | 0–1 per plan; confirmed execution uses signed plan rather than planning again |
| Google Tasks missed inquiry classifier | src/google-voice-inquiry-gemini.ts | generic family resolver | at most 1 per classifier invocation, only bounded marked read-only inquiries |
| ICS ambiguous-time normalization | src/calendar-ics-import.ts, aiSuggestions/calendarImportNormalize | generic family resolver | ceil(ambiguous candidates / 30) when use_ai=true; ordinary import preview does not call AI |
| Admin connection/compatibility/select tests | src/family-ai.ts, compatibility | selected or explicitly tested model | 1 fixed synthetic generation per test/select; compatibility then select can test twice |
| Model catalog | src/family-ai.ts, listGeminiModels | project API catalog | no generation; up to 2 paginated models.list GETs |

Google Home SCENE execution, child-journal adapters and canonical Family Log saves
do not themselves invoke Gemini. There is no independent child-journal AI drafting
owner in these current paths. Morning fortunes also have deterministic fallbacks
in src/daily-fortune.ts; they are not separate provider requests.

Runtime entrypoint: src/index.ts. Daily and periodic digests are on */5 cron;
Family Daily Journal generation follows Location archiving at minute 17 hourly.
Google Tasks has its separate 3,8,...,58 cadence. Do not add another scheduler.

### Usage findings

- P1: src/family-daily-journal.ts increments content_version on every refresh even
  if all source content is unchanged. Its 7-day repair window refreshes after
  24 hours; this makes already-generated text eligible again. Fix with atomic
  content comparison while still refreshing freshness timestamps and detecting
  real corrections; do not solve by permanently caching old facts.
- P1: journal AI candidates have no atomic generation claim in the read → provider
  → write chain. Overlapping scheduled runs could spend duplicate requests.
  Actual production overlap is not established. A lease/claim contract requires
  failure/recovery tests before adding retries or changing scheduler behavior.
- P2: failures retry after 6 hours; repeated budget/auth/model failures can keep
  consuming attempts. Record/retain coarse actual reason; no unconditional retry
  suppression without recovery semantics.
- P2: ICS explicitly requested AI normalization processes all ambiguous candidates
  in batches of 30 but returns at most 50 suggestions. With the 5,000-event file
  cap, theoretical request count reaches 167. A separate bounded proposal/paging
  contract is needed; do not silently drop import records.
- Morning/periodic finalized frames prevent normal regeneration on later delivery
  retries, including deterministic fallback. They reserve each request; the
  fallback-model reservation intentionally bypasses the current circuit.
- Rough input keeps the existing budget and 429 stop. Message draft re-analysis is
  an explicit analysis operation, not an ordinary page-read generation.
- No claim of account quota exhaustion or invalid model IDs is made from source.

### Phase A1 implemented by this PR

- src/ai-model-routing.ts is the common resolver for ROUGH_INPUT and MESSAGE_DRAFT.
  It owns their old defaults exactly once and reads family_settings per
  feature/audience. OWNER comes from authenticated member context; ADMIN and
  other members use MEMBER. No client-supplied role/family selects the route.
- src/settings-ai-model-routing.ts provides OWNER/other columns, optional fallback,
  reset, and project-catalog validation. No schema migration. GET/resolution performs
  no provider request. Saving calls models.list, never generateContent.
- Duplicate primary/fallback model IDs are deduplicated; each route remains at most
  two models. Missing or malformed settings use established defaults; storage
  failure in analysis returns the existing STORAGE deterministic fallback.
- Existing budgets, 429 behavior, source provenance, confirmation and save paths
  remain in their feature owners. The shared ROUGH_INPUT diagnostics still report
  actual attempt models; role-specific execution attribution is not yet claimed.
- Model inventory uses the same effective resolver, not duplicate constants.
- Actual 3.6/3.7 project availability must be checked with the admin catalog.
  Human release labels are not converted to guessed API IDs.

Next A2: migrate Family AI, inquiry and ICS callers using their trusted actor
context, then shared digest/journal callers. Shared family jobs need an explicit
FAMILY policy rather than choosing an arbitrary recipient or doubling requests.
Only after routing migrate morning wording to today's tasks / tomorrow's tasks /
unfinished work. Personal text should be brief; fortune removal is a separate
output/validation/cache-version change, not a model-setting side effect.

## B. Google child journal

Golden path:
src/google-home.ts bearerMember → sceneCatalog/SYNC → ActivateScene EXECUTE →
external_command_receipts claim → recordQuickChoreDomain in
src/family-external-domain.ts → response receipt.

Child path uses the same protocol/receipt envelope but:
- requires childJournalFoundationReady in src/child-journal-schema.ts;
- publishes only stand, first_step, first_tooth and tooth milestone Scenes;
- dispatches to src/child-journal-google-home.ts, rechecking same-family active
  BABY/CHILD, and writes family_logs plus family_log_journal_entries.
- Tasks is a different input channel: src/google-tasks.ts recognizes explicit
  marked growth height/weight/memo grammar and delegates to
  src/child-journal-google-tasks.ts with 0–1440-minute offset bounds.

P1 unresolved runtime failure: no current reproduction envelope proves whether
the command is published, received, rejected by schema/subject, or fails saving.
Reuse src/google-home-execute-diagnostics.ts / existing receipts to identify the
stage. Do not replace working chores with a speculative NLU engine.

Missing reuse contract: web src/child-journal.ts and the two adapters write the
same canonical tables but contain separate validation/insert code. Before expansion,
extract a tested common validation/save owner, preserving same-family scope,
compensation and receipt replay. No new independent journal store.

src/child-journal-calendar.ts and migration 0049 own the separate CHILD_JOURNAL
calendar/outbox. No normal schedule calendar ID substitution.
Connected Calendar inventory was read-only; it does not prove the app's private
D1 account-to-calendar bindings or Google Home command success.

Tests read/run: child-journal-google-home-contract.mjs,
child-journal-google-tasks-voice-contract.mjs: PASS at baseline.

## C. Family Journal completion audit

| Boundary | Evidence / remaining gap |
| --- | --- |
| Date/generation | src/family-daily-journal.ts: previous day and 7-day repair window; preserve current date contract |
| Deterministic storage | migration 0078; unique family/date, HOT storage and content version |
| AI generation/storage | src/family-daily-journal-ai.ts, migration 0080; deterministic summary retained on failure |
| Fetch/detail | src/family-daily-journal-ai-page.ts wrapper over family-daily-journal.ts; GET does not generate |
| Home preview | src/home-dashboard.ts, yesterdayJournal; reads stored narrative or deterministic fallback |
| Location visibility/time | current shared-member filtering; locationTimeOnly uses family timezone already: do not redo |
| Tasks | task_completion_history; family-visible non-event records; separate recurrence completion coverage needs verification |
| Chores/Family Log | HOUSEWORK subset of family_logs only; general child logs and journal text are not included |
| Member view | details contain member grouping/attribution; not a complete arbitrary member-filtered journal |
| Photos | separate child-journal/private family_log_media path exists; not included in Family Daily Journal |
| Empty/failure | deterministic empty summary; AI failures leave deterministic display available |

P1: Home and detail gate on AI_OK but do not check
ai_source_content_version = content_version. Source corrections can leave stale
AI prose displayed until generation catches up. Add exact-version display checks
with stable-version refresh and concurrent-update tests.
P2: shared child-text/photo integration and recurrence completion coverage need
explicit projection contracts; no whole-system completion claim.
Existing family-daily-journal(-ai)-contract tests PASS but do not prove these gaps absent.

## D. Family Log mobile UI / ingredients

Owners: src/family-log-page.ts, src/family-log-api.ts,
public/assets/family-log-core.js, family-log.js, family-log-compact-ui.js.
Existing child journal: src/child-journal.ts + migration 0048. Photos reuse
src/family-log-media-api.ts and family_log_media from migration 0057, with private
authorization and cleanup queue. Reuse records/media; never copy private photos
into a new public journal store.

Existing meal detail/free text/photo fields do not normalize a registered
ingredient's stage and first-consumption history. Design minimal family ingredient
catalog plus subject/ingredient consumption-stage relationship; define whether
first date is derived or editable before migration. Preserve imported historical
meal descriptions. No ingredient schema/medical advice added in A1.

PR order: data contract → navigation shell → growth/housework quick-input strips
with low-frequency menu → chronological growth list → registered ingredient UI.
Do not change shared bottom-navigation order or the separately assigned Shopping
return-date/Home-shortcut tasks. D may touch common shell spacing; coordinate first.

## E. Stamp hard deletion

Current admin owner src/calendar-stamp-admin-api.ts only toggles active through
src/calendar-stamp-actions.ts. deleteCalendarStampPlacement deletes an assignment,
not the asset.

References to protect: calendar_stamp_placements (0045),
calendar_stamp_asset_frames (0046), message_stamp_attachments (0050),
calendar_shared_stamp_refs (0054). Child/Family Log photos use a different media
contract; do not treat them as stamps.

Storage owners: src/calendar-stamp-storage.ts / calendar-stamp-media-api.ts;
ASSETS is repository-owned, UPLOAD is managed media; shared publication has
separate registry/import/publish owners. An asset can have frame/thumbnail keys
and shared refs, so a master-row DELETE is insufficient.

Proposed contract: reject deletion if assigned/attached/published references
exist. For proven-unused managed uploads, transactionally stage deletion with
keys in a private retryable cleanup owner, then delete storage and finalize
metadata without reopening assignment races. Repository ASSETS cannot be
physically deleted by a runtime R2 handler. Confirm explicitly in admin UI.
Migration need depends on safe reuse of an existing cleanup queue; not decided.

## F. Existing safeguards / verification scope

- src/recurring-page.ts delegates series assignee changes to
  reconcileTaskCompletionAfterAssigneeChange; future-split cleanup explicitly
  excludes exception_task_id and excluded occurrences. Existing contract PASS.
- Morning diagnostic records AI_OK/FALLBACK, actual attempted models/stages;
  scripts/morning-attempt-evidence-contract.mjs PASS.
- Quick success recovery and idempotent compact MutationObserver update contract
  scripts/family-log-success-recovery-contract.mjs PASS. No reimplementation.
  Device-level network recovery/duplicate acceptance still needs real-device
  evidence after any later D changes.
- No runtime PASS is inferred solely from static/source contract tests.

## Coordination / sequence

#381 was FREE; open #876 and #881 owned documentation-only cleanup paths.
A1 does not touch those files. Acquire/release write critical sections and re-read
main/PR/checks before merging. Current source always supersedes this snapshot.

Recommended sequence: A1 routing foundation → A2 remaining callers/shared policy
→ B precise stage evidence/canonical reuse → C stable versions/stale prose and
projection gaps → E reference-safe deletion → D staged UI/schema work.
If a critical privacy/data-loss regression is proven, reprioritize explicitly.
Do not use Cloudflare Observability.
