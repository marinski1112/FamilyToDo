# Cloudflare Wave122 — 12.141.0-wave122

## Google Home diagnostics
- Kept the virtual-device contract as `action.devices.types.SCENE` / Scene trait and made no OAuth, LIFF, physical-device, Request Sync, or migration architecture change.
- Split status into active-token authentication, latest successful SYNC with catalog-count comparison, latest successful EXECUTE, and linked recorder member. All values come from existing D1 records; settings load makes no Google API request.
- Documented Developer Console SCENE alignment and voice → ActivateScene → Family TODO record → diagnostic SUCCESS acceptance.

## Repository-wide form inventory
Before changes, forms in today/tomorrow, tasks (new/edit/detail and recurring), calendar modal/jump/import, shopping new/edit, Family Log recording/management/quick editor/chores, messages new/edit, settings members/notifications/content/integrations/diagnostics, and item forms were inventoried for date, datetime-local, time, number, select, short text, checkbox, and action controls. The audit found several Wave16–38 date sizing layers, mobile one-column overrides, three-column quick actions/chores, and three generations of calendar jump geometry.

## Mobile density
- Replaced the obsolete form-sizing layers with one Wave122 canonical section: 40px native date/time/datetime-local/number/select controls, 16px text, compact labels/rhythm, `min-width:0`, and `border-box` grid children.
- Added shared compact form, two/three-column field, date/time pair, inline field, and compact action primitives. Task create/edit start/end dates and times remain two columns down to 341px, with a 320px one-column safety fallback.
- Standardized Family Log quick actions and quick chores on four columns at normal mobile widths, a three-column fallback at 340px, 44px targets, and two-line labels.
- Consolidated calendar jump styling to a 300px bounded panel with year/month/action and date/action rows, static 40px white-text move buttons, and two shortcut columns.
- Compact status definition lists are available to settings/diagnostic views; primary touch targets and focus behavior remain intact.

## Data and cache
- No migration was added; `0040_wave120_family_log_quick_actions.sql` remains latest.
- Shared CSS and changed runtime asset references use `12.141.0-wave122`.
