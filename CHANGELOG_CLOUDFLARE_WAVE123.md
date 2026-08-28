# Wave123 — iOS native controls and voice responsibility

Version 12.142.0-wave123 introduces one server-rendered `native-control-shell` for every date, time, and datetime-local input. The shell owns 40px geometry and the native input retains its picker with zero horizontal padding, avoiding WebKit bug 301648. The repository audit currently finds all temporal fields and fails if the layout wrapper or canonical rules disappear.

Calendar jump now uses bounded 292px fixed grids. Shopping batch is a compact form. Quick chores remain four columns from 360px and use a single-line 11.5px label; 340px and below uses three columns.

Active parameter-free Family Log `QUICK` actions are published as stable `ft:flquick:<id>` Home scenes. `FORM` and `SLEEP_TOGGLE` stay excluded. Preset voice records belong to scenes; arbitrary values belong to the deterministic Google Tasks inbox; scheduled events and queries remain Google Calendar's responsibility. Cloud-to-cloud scenes are not a free-form spoken query API.

No migration was added: existing migrations 0039 and 0040 remain authoritative.
