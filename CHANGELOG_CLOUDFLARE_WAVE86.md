# Cloudflare Wave86 — 12.105.0-wave86

- Replaces the untracked `/assets/daily.js` reference with a new current-DOM/API `task-events.js` controller; Git history contains no recoverable `public/assets/daily.js`.
- Defines overdue ordinary tasks against today's JST date, with owner-filtered PRIVATE visibility and inline completion controls.
- Uses a resilient inline `<details>` overdue list and compact accessible 🛒＋ task action.
- Removes task/item/shopping shared activity logs when a FAMILY task becomes PRIVATE, preventing resurrection after domain deletion while preserving completion and Family Log history.
- Adds static-asset CI validation, Wave86 domain/browser/privacy smoke coverage, and replaces Wave85's negated `rg` diagnostic assertion with Node.
- No migration is required.
