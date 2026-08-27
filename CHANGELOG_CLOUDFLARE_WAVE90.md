# Cloudflare Wave90 — 12.109.0-wave90

## Family Log importer production stabilization

- Removed the Wave89 smoke test's ripgrep dependency and exercised the shared 100-record chunk protocol with Node.
- Enforced contiguous offsets, idempotent completed-chunk retries, exact finish and outcome-count invariants.
- Bound every chunk to the selected source document with a compact per-chunk SHA-256 manifest; the original JSON remains client-only.
- Added status-only resume support, incomplete-import history guidance, detailed final confirmation, partial rollback coverage, and expanded read-only diagnostics.
- Confirmed VACCINE for BABY/CHILD manual entry and imports, storing the vaccine name in `value_text` without units or forced detail codes.
