# Family TODO LINE Cloudflare Wave60

Version: `12.79.0-wave60`

## Calendar interaction repair

- Fixed a rendered inline-JavaScript parse failure in the calendar day-detail renderer.
  - The Worker generated an inline `<script>` from a TypeScript template literal.
  - `replace(/\r?\n/g, '<br>')` inside that template was being interpreted while the HTML was rendered, which could inject control characters into the generated JavaScript and stop the entire calendar script.
  - Wave60 replaces the rendered newline conversion with `String.fromCharCode()` based handling so no regex escape can be corrupted by the outer template literal.
- Removed a second render-time escape risk from the calendar initial `date=` validation; it no longer relies on a regex escape embedded in the inline script.
- Added explicit iOS/LINE WebView touch handling for the month calendar:
  - tap day -> open day detail
  - horizontal swipe -> previous/next month
  - suppress synthetic click after touch to prevent double activation
- Pointer handling remains for mouse/pen.
- Added a `data-calendar-js="ready"` marker after successful script startup for future diagnostics.
- CSS cache version bumped to `12.79-wave60`.

## Cleanup

- Corrected the stale `source_inventory.json` note that still implied legacy event schema artifacts remained after Wave52.
- Added Wave60 residual analysis with prioritized XREA parity, UI, lifecycle, and repository-cleanup work.

## Database

- No new D1 migration.
- Latest migration remains `0015_wave52_remove_legacy_event_fk.sql`.

## Verification

- `npx --no-install tsc --noEmit` passes.
- Calendar inline-script source section has no remaining backslash escape sequences that can be transformed by the outer TypeScript template literal.
