# Wave120 — 12.139.0-wave120

- Google Home account linking is separated from LIFF and uses LINE Login OAuth v2.1 Authorization Code + S256 PKCE, encrypted ten-minute transactions, state/nonce checks, and terminal failures.
- Normal Rich Menu LIFF login remains and resolves `next` after `liff.init`; canonical slash-bearing Rich Menu URLs are documented.
- Added subject-owned editable Family Log quick actions with QUICK, FORM, and SLEEP_TOGGLE modes. BABY defaults are bootstrapped once from the existing milk presets.
- Fixed calendar jump-panel overflow using bounded width, shrinkable grid tracks, and controls with `min-width: 0`.
- Added append-only migration `0040_wave120_family_log_quick_actions.sql` and Wave120 smoke coverage.
