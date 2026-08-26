# Family TODO LINE Cloudflare Wave61

Version: `12.80.0-wave61`

## Calendar interaction
- Day-detail horizontal swipe is attached to the whole day sheet instead of only the text/body area.
- Horizontal drag now gives a small live translation/opacity preview before changing day/month.
- Day transitions use a two-stage slide/fade animation and month transitions use a wider, smoother easing curve.
- Touch handling remains native `touchstart`/`touchmove`/`touchend` for LINE iOS WebView; mouse/pen pointer support remains.

## Multi-day calendar parity
- Replaced repeated per-day multi-day chips with XREA-style stable horizontal bands.
- Multi-day tasks receive a global stable lane so they remain visually aligned across week boundaries.
- Bands are clipped at week boundaries with start/middle/end segment radii.
- Up to three multi-day lanes are shown; overflow is counted per day.
- Single-day tasks, shopping counts and carry items remain inside the day cell.

## Safety
- No D1 migration. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.
- Legacy DB `events` are not restored.
- `tsc --noEmit` passes.
- CSS cache-bust bumped to `12.80-wave61`.
