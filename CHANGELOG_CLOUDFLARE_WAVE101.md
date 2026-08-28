# Cloudflare Wave101 — 12.120.0-wave101

## Calendar roundtrip and production consistency

The inbound defect came from treating every Google event as proof that the linked local record was an EVENT. `applyInbound()` now uses `external_calendar_links` as authority: a linked row receives only the Calendar projection (title, description, local start/end/due, location, all-day and visibility). It never changes `task_kind`, `completion_mode`, `status`, assignees, or completion rows. Consequently linked TASK and EVENT roundtrips retain their semantics; only an unlinked Google event creates a new EVENT. Cancellation remains a soft hide (`calendar_visible=0` plus link `deleted_at`).

An inbound `familyTodoTaskId` is accepted only as a hint to an already existing link joined to a task in the same family. A foreign-family id cannot attach a task. Event id, etag, the link uniqueness constraint and the existing manual/cron lease remain layered duplicate defenses for the outbound-followed-by-inbound initial-sync case. PRIVATE eligibility, five-minute cron, UTC operational timestamps, all-day conversion, sync token/410 recovery and bounded retry remain unchanged.

The compact integrations view continues to show linked state, last sync, pending/error counts and family timezone. OAuth callback output remains limited to safe linked/cancelled, token-exchange, calendar-creation and reauthentication categories; no Google body, secret or token is rendered.

## Privacy-first dynamic statistics v2

`family_statistics` adds an enum-only typed plan for FAMILY_LOG, QUICK_CHORE, TASK and SCHEDULE. Metrics, grouping, comparison, ordering and direction are all Worker allowlists. Plans contain at most three queries, each returns at most 100 groups, and COMPARE requires exactly two steps. Thresholds are compiled as aggregate `HAVING`, not row `WHERE`; quick-chore MEMBER ranking retains `created_by` semantics. Units are selected from the validated metric/log type (ml, minutes, °C, kg, cm or count), never guessed by Gemini.

Supported plans include latest day whose daily milk sum reaches a threshold, top milk days, member/chore rankings, maximum sleep day, monthly sleep aggregation, latest weight and deterministic two-period comparison. Family-relative words are planned using the family timezone/current local date, while Family Log timestamps remain local wall-clock values with no second conversion.

Names are replaced with opaque MEMBER/SUBJECT references before the model call. Same-kind duplicates still request clarification; member/subject collisions use explicit log-versus-chore/task context or request clarification. Gemini receives only the tokenized question, enum schema, family timezone and current date. Database rows, aggregates and comparison results never return to Gemini; the Worker executes and formats the compact Japanese answer. SQL, identifiers and raw operators are not tool inputs. Optional normalized debug output is admin-only and never stores the question or raw rows.

## Schema and follow-up

No migration was added and existing migrations through 0034 are unchanged. DIAPER remains represented by existing structured `value_text` values (such as WET/DIRTY); Wave101 deliberately does not introduce unsafe free-text matching. Google Home Wave96 is unchanged. A future voice readback can invoke the same typed planner, but must preserve tokenization and Worker-only execution/formatting before being enabled in Google Home Developer Console.
