# Cloudflare Wave95 — 12.114.0-wave95

- Extended the guarded, persistent sleep timer to BABY and CHILD subjects with shared 12/16/48-hour protections and no automatic stop.
- Added `family_quick_chores.weekday_mask` (Monday bit 1 through Sunday bit 64, default 127), selected-date JST filtering, compact weekday editing, and a three-column mobile recording grid. Recording remains permitted through the API on an off-day to support corrections; weekday selection only controls daily visibility and never removes history.
- Replaced management subject navigation with direct modal editing, removed the second edit step, compacted settings/chore rows, and made the management back control an icon-only safe-area-aware 44px target.
- Updated sleep diagnostics for BABY/CHILD and documented a privacy-first provider-neutral Google Calendar integration boundary without implementing sync schema.
