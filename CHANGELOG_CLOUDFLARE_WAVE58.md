# Family TODO LINE Wave58

Version: 12.77.0-wave58

## Fixes
- Fixed inline-JavaScript newline parsing failure on recurring-task page.
- Conditional recurring fields now react again in LINE WebView.
- Fixed same newline hazard in family invitation sharing text.
- Hardened invitation creation feedback/error handling.
- Invite share text now asks users to add the official account first, then open the family join URL.
- Refreshed CSS cache-busting to 12.77-wave58.

## Validation
- `npx --no-install tsc --noEmit` passes.
- No new D1 migration is required.
