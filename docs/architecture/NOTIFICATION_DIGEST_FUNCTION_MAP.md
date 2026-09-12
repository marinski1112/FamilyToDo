# Notification and digest ownership map

Verified against main `136399bf5dd17ba3e8590895465ecaf9b476a1c7`.

This map records current notification delivery and LINE digest ownership. Historical design notes are not treated as runtime truth.

## Canonical boundaries

| Concern | Canonical owner / exported function | Route / caller | Data / side effects | Safety / regression boundary |
| --- | --- | --- | --- | --- |
| Notification settings | `src/settings-notifications-page.ts#settingsNotifications()` | `GET/POST /app/settings_notifications.php` via `src/page-routes.ts` | member notification opt-in/channel, LINE morning digest enable/time/tone/recipients/Family Log subject filters; Web Push diagnostics/read model | authenticated member; admin-only family-wide digest/member controls; CSRF on mutation; family-scoped member/subject validation |
| Web Push delivery | `src/notification-delivery.ts#processNotifications()` | Worker scheduler every 5 minutes | bounded due query from `notifications`; delivers to enabled `web_push_subscriptions`; marks sent/retry/error and removes gone subscriptions | send-time member/family/target/PRIVATE-visibility/recurrence validity guards; max 50 notifications and 10 subscriptions per member per tick |
| Notification lifecycle repair | `src/notification-lifecycle.ts#cleanupNotificationLifecycle()` | hourly `:17` scheduler | cancels stale/unsafe pending notifications, disables stale subscriptions, clears stale conversion pointers, detaches impossible task child links, suppresses duplicate pending reminders | operational repair is intentionally separate from delivery; it does not replace send-time safety checks |
| Notification integrity/retention audit | `src/notification-lifecycle.ts#auditNotificationLifecycle()` | daily `18:29` scheduler | prunes `activity_logs` older than 31 days and reports cross-domain integrity counts; does not delete domain completion history or Family Log | audit/retention maintenance only; not a notification delivery owner |
| Morning LINE digest fact aggregation + composition | `src/line-daily-digest.ts#processLineDailyDigests()` and local helpers | Worker scheduler every 5 minutes, gated by family-local configured send time | builds deterministic family facts from FAMILY-visible Task/Event/Item/Family Log/location/weather projections; adds daily fortune; sends LINE digest to enabled recipients | family-scoped recipients/subjects, bounded facts/output, privacy-safe profile context, no raw GPS/profile memo leakage |
| Morning digest AI narrative | `src/line-daily-digest.ts#chooseFrame()` | called by morning digest generation | optional Gemini recap/member note/fortune layer; deterministic frame remains fallback | model output must pass JSON, size, numeric-claim and profile-leak safety validation; AI failure must not block deterministic delivery |
| Morning digest AI budget/circuit/finalization | `src/line-daily-digest-ai-guard.ts` | morning narrative generation | per-family/day and global/day request reservation, 429 backoff, persisted finalized frame | max 2 requests per family/day; max 120 global/day; 15-minute 429 backoff; finalized frame prevents repeated generation for same family/day |
| Digest generation diagnostics vocabulary | `src/line-digest-generation.ts` | daily/periodic digest generators and notification settings diagnostics | sanitized model attempt metadata and AI/FALLBACK reason labels; detects generated numeric claims | diagnostic metadata is bounded; prompt/response/profile/Family Log/location raw bodies are not part of this diagnostic contract |
| Weekly/monthly LINE digest | `src/line-periodic-digest.ts#processLinePeriodicDigests()` and helpers | Worker scheduler every 5 minutes; weekly/monthly due-window checks | aggregates FAMILY-visible Task/Event/Item/Family Log period facts; generates optional Gemini summary with deterministic fallback; sends LINE period report | bounded period facts/output; PRIVATE tasks excluded; AI narrative passes leak/numeric-claim safety checks |
| Weekly/monthly AI guard | `src/line-periodic-digest-ai-guard.ts` | periodic digest narrative generation | persisted per-report generation reservation/finalization and rate-limit protection | separate report identity by family + report type + period key; AI failure must not block fallback report |
| Scheduler orchestration | `src/index.ts#scheduled()` | `*/5 * * * *`, `17 * * * *`, `29 18 * * *` | every 5 minutes runs notifications + daily digest + periodic digest; hourly `:17` runs lifecycle cleanup; daily `18:29` runs lifecycle audit | schedulers invoke domain owners; they do not merge delivery, digest generation and maintenance ownership |

## Current-state rules

- Ordinary task/message reminders and LINE family digests are separate delivery domains. `notifications` + Web Push is not the persistence or delivery owner for morning/weekly/monthly LINE digest reports.
- Notification delivery must retain send-time tenant, member, target, recurrence and PRIVATE-task checks even though hourly lifecycle repair also cancels stale rows.
- Morning digest generation has a deterministic path. Gemini is optional; a provider error, invalid output, rate limit, missing key, disabled AI, budget/circuit limit or guard-storage failure must not make the family lose the underlying deterministic morning report.
- The persisted morning AI frame is family/day scoped. Once finalized, repeated five-minute scheduler ticks reuse the finalized frame rather than generating a fresh Gemini narrative on every tick.
- Morning AI has an explicit request guard: at most 2 requests per family/day and 120 globally per infrastructure UTC day, with a 15-minute global backoff after 429.
- Generated digest prose may not introduce arbitrary numeric claims. Counts and measured facts remain deterministic facts; generated prose is rejected when it violates the numeric-claim or hidden-profile safety checks.
- Safe AI profile context is optional personalization input, not canonical family data ownership. Hidden personality/birth/location profile details must not be echoed into the LINE narrative merely because they were available to the model.
- Weekly/monthly reports are separate period-report owners from the morning digest. They may share AI-provider and safety helpers but have independent period identity/finalization state.
- The notification settings page already exposes recent AI-generation status/reason/model/request-count information for admins. That UI indicates generation state, not LINE delivery success.
- `auditNotificationLifecycle()` currently prunes only operational `activity_logs` at the documented 31-day boundary. It intentionally leaves domain completion histories and Family Log untouched.
- Search returning zero is not evidence that a dedicated contract or owner is absent. A boundary should be classified only from positively read current source/manifest evidence.
