# Cloudflare Wave100 — 12.119.0-wave100

## Wave99 evaluation and Calendar operations

Wave99's dedicated-calendar OAuth, outbound link/outbox, incremental `syncToken`, pagination, 410 reset, etag no-op, cancellation hiding, all-day conversion, and PRIVATE exclusion remain intact. The retry defect mixed Tokyo-naive comparison timestamps with UTC-naive retry timestamps. Wave100 stores new Google integration operational timestamps uniformly as UTC-naive SQL values. Retry scheduling is a pure, bounded exponential helper (2, 4, … minutes, capped at one day and eight attempts); legacy zero-attempt PENDING rows remain immediately eligible.

Exhausted rows are counted without exposing payload/error detail and OWNER/ADMIN can reset them. Readiness now reports configured booleans, exact `calendar.app.created` scope, family timezone, and scheduled sync. OAuth failures expose only safe categories and Google error bodies/tokens are never logged. Disconnect still revokes the account and never deletes the secondary calendar; relink still reuses an accessible calendar. An isolate-local family lease coalesces overlapping cron/manual inbound sync; DB uniqueness, event links and etags remain the cross-isolate duplicate defenses. No migration was added.

## Timezone audit

* **A — family wall clock:** today/tomorrow/task/calendar route defaults, Family Log/AI date semantics, event conversion, quick-chore weekdays, and user notification schedule values. Authenticated defaults now resolve after context from `families.timezone` (via `family_timezone`); `APP_TIMEZONE` is fallback only.
* **B — JST fixed:** legacy bootstrap/default-family compatibility and explicitly Japanese legacy display behavior pending a separately scoped UI refactor.
* **C — system UTC:** Google account, link, sync-state, outbox created/updated/last-sync/retry timestamps and OAuth expiry instants.

## Family AI readiness

Answers now include target, period, and aggregation provenance. The allowlisted read-only tools and family-local current date remain. Raw Family Log rows are still queried only after Gemini chooses a tool and are never sent to Gemini. Admin connectivity testing sends one fixed synthetic prompt, never a user question or family data, and secrets remain Worker Secrets.

## Production verification

Set `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, and `GOOGLE_CALENDAR_TOKEN_KEY` with `wrangler secret put`; separately set `GEMINI_API_KEY`. Confirm the redirect URI exactly matches Google Cloud, connect as OWNER/ADMIN, verify the dedicated Family TODO calendar, create/update/delete eligible FAMILY events/tasks, run manual sync, then inspect the next five-minute scheduled run. Cancel OAuth once to verify the safe category; exhaust/retry a staging outbox item; disconnect/reconnect and confirm the calendar is retained. Google Home credentials are unrelated and unchanged.
