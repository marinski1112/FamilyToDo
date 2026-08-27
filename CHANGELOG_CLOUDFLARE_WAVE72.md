# Cloudflare Wave72

Version: **12.91.0-wave72**

## Browser JavaScript externalization
Moved remaining high-risk onboarding/browser code out of TypeScript template literals:
- `public/assets/liff-auth.js`
- `public/assets/family-onboarding.js`
- `public/assets/item-new.js`

### LIFF / login
- LIFF entry and login now share one static controller.
- Dynamic `LINE_LIFF_ID` / safe next URL are supplied through `#liffAuthPayload` JSON.
- Added explicit SDK-missing, HTTP, JSON, and ID-token error handling.
- Retry button remains available without duplicating two inline implementations.

### Family create / join
- Family create, family-code join, and invitation-token join now share `family-onboarding.js`.
- Submission buttons are disabled while processing.
- Errors render inline instead of depending on browser `alert()`.

### Carry-item creation
- `item/new.php` submission is moved to `item-new.js`.
- Adds HTTP/JSON error handling and an inline error area.

`npm run check:browser-js` now parses these new static assets too.

## Lifecycle archive commonization
Added to `src/lifecycle.ts`:
- `archiveRecurrenceRuleOccurrenceStatements()`
- `archiveRecurrenceOccurrenceCompletionStatements()`

Main task deletion, legacy task deletion, recurring-series deletion, and recurrence-exception exclusion now reuse these helpers rather than embedding duplicate archive/delete SQL.

## Event semantics audit
- Existing `EVENT` rules remain unchanged: calendar/date views and reminders are allowed, while completion/expired/unorganized/home pending-count semantics exclude events.
- No legacy `events` table is restored.

## Validation
Passed:
- `npx --no-install tsc --noEmit`
- `npm run check:browser-js`
- fresh SQLite migrations `0001`–`0015`
- recurrence occurrence archive/delete smoke test
- `PRAGMA foreign_key_check`

## Migration
No new D1 migration.
Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
