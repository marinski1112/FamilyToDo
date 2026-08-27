# Cloudflare Wave91 — Family Log dashboard

Version: `12.110.0-wave91`

## Changes

- Added a compact, collapsible Family Log summary for today, 7 days, 30 days, or a custom JST calendar range.
- D1 computes daily/type aggregates. The Worker never fetches all raw logs for dashboard rendering.
- Added CSS daily bars for milk and sleep and inline SVG time-series charts for temperature, weight, and height. A single growth point stays in its summary card.
- Added MILK, SLEEP, DIAPER, MEAL, TEMPERATURE, WEIGHT, HEIGHT, and VACCINE cards, plus a non-diagnostic vaccine history.
- Timeline reads at most 51 rows, displays 50, supports enabled-type filters, and provides previous/load-more navigation.
- Added migration 0028 with one partial active-log subject/type/time index. Existing migrations and the Wave90 import protocol are unchanged.
- Dashboard and history always require `deleted_at IS NULL`; rollback-soft-deleted imported records remain excluded.

## Performance expectation

At approximately 2,500 imported rows, response size is bounded by daily aggregate buckets, three latest metric rows, up to 50 vaccine rows, and 50 timeline rows. D1 performs aggregation and the partial index accelerates subject/type range access.
