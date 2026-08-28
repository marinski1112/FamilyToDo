# Cloudflare Wave118 — 12.137.0-wave118

## CI and security regression
- Replaced Wave104's stale inline `safeNext` implementation assertion with semantic tests of the central `validateLiffNext` validator.
- Connected Wave117, LIFF, Google Home OAuth, and Wave118 smoke suites directly to GitHub CI.
- The Wave117 OAuth continuation, state/cookie isolation, loop guard, and server-side redirect validation design is unchanged.

## Calendar
- Removed legacy week-wide vertical margins from single-day content and made each cell's `--calendar-day-band-rows` the sole offset source.
- Added a compact, bounded 2000–2100 year/month/date jump panel, Today/this-month shortcuts, and validated exact-date modal opening through `open=YYYY-MM-DD`.
- Updated calendar CSS/JS cache keys.

## Family Log
- Compact quick-entry sheet hides already-known type/subject controls, keeps datetime in one row, and places linked targets, notes, and provenance in an expandable detail section.
- Added deterministic latest milk amount defaults per active subject, configurable 1–6 milk presets stored in `family_settings`, and unrestricted valid free input.
- Settings and records remain server validated; no migration and no AI inference were added.
- Updated Family Log JS/CSS cache keys.
