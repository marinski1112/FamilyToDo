# Cloudflare Wave99 — 12.118.0-wave99

## Diagnostics production 500

The production failure was the PRIVATE-integrity query at `Promise.all` index 12. It built a compound result with six `UNION ALL` branches; detail queries repeated the same pattern and other linkage samples used compound selects. Wave99 removes compound selects from the diagnostics path. Fourteen bounded count queries run with `Promise.allSettled`; one failed card shows a warning while the page remains available. Initial detail sampling was removed. Detail is an OWNER/ADMIN-only allowlisted endpoint and is only called by “詳細を見る”. The initial lifecycle budget is 14 D1 queries (previously 13 counts + 13 unconditional samples + Web Push/import/calendar = 29 queries).

## Google Calendar

OAuth now requests only `calendar.app.created`: Google documents it for calendars created by the app and their events, matching the dedicated secondary-calendar design. Missing Worker secrets redirect back to a human-readable integration page. Callback state is signed, expires after ten minutes, and the linked active member/family is revalidated. A valid existing calendar ID is reused on relink.

Inbound sync lists only the stored Family TODO calendar. It persists `nextSyncToken`, uses `syncToken` thereafter, paginates, and resets safely on Google HTTP 410. Google creates/updates become FAMILY EVENT tasks. Google cancellation hides the event from the Family TODO calendar without deleting tasks or completion history. Applying inbound changes writes D1 directly rather than calling task mutation/enqueue code, preventing loops. D1 remains the normal source of truth, while an explicit newer Google event mutation is accepted; etag equality makes repeat delivery a no-op.

All-day Google end dates are converted from exclusive to Family TODO inclusive and reversed for outbound projection. Offset date-times are normalized to family-local wall-clock. Revoked refresh tokens set the existing `REVOKED` state and surface reauthentication UI. Scheduled account processing and manual sync isolate errors per account.

## Operations

Required secrets remain `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, and `GOOGLE_CALENDAR_TOKEN_KEY`. No secret value, refresh token, Gemini key, Web Push endpoint, p256dh, or auth value is rendered. No migration is required: Wave97's account/link/outbox/sync-token schema already contains the required Wave99 state.
