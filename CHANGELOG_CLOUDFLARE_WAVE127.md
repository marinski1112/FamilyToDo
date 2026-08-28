# Cloudflare Wave127 — 12.146.0-wave127

## Family AI model control
- Google `models.list` (`pageSize=1000`, at most two pages) is the catalog authority. General-purpose `generateContent` models are selected without version allowlists; preview/experimental models are marked and sorted after stable models.
- OWNER/ADMIN model catalog, compatibility, selection, and reset APIs require CSRF. Selection is saved as `family_ai_gemini_model`; precedence is family setting, `GEMINI_MODEL`, built-in default.
- Saving revalidates the live catalog and runs a synthetic `family_ai_test` function call. Model catalog availability is never labelled as free-tier availability and models never auto-switch.

## Google synchronization
- Migration 0041 adds hash-only Calendar watch channel state. The public webhook validates channel, resource, and hashed token and acknowledges before incremental pull in `waitUntil`.
- Channels are renewed new-first within 24 hours of expiry and stopped best-effort on disconnect. Inbound polling remains a 30-minute safety net.
- Calendar outbound remains D1-outbox based, gains best-effort local-mutation wake-up, and retains five-minute retry. Google Tasks uses staggered five-minute incremental polling. Google Home Request Sync behavior is unchanged.

## Diagnostics and release
- `src/version.ts` is the application/version diagnostic authority, verified against package and inventory by `check:version`.
