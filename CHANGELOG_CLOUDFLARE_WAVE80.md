# Cloudflare Wave80

## Stability and cache delivery

- Aligned the application and inventory version to `12.99.0-wave80`.
- Bumped only the changed shared stylesheet and Family Log script cache keys.
- Added common `400 Bad Request` and `403 Forbidden` handling while preserving login redirects, migration-related `503` responses, and unknown-error `500` responses.
- Removed obsolete npm checks for browser scripts that no longer exist.

## Family Log and quick chores

- HOUSEWORK records are always family-wide (`subject_id = NULL`); `created_by` remains the actor.
- Restored quick chores are appended after all currently active chores.
- Migration 0021 adds nullable `family_logs.quick_chore_id` for stable aggregation while `value_text` retains the execution-time name snapshot.

## Release validation

- TypeScript, browser JavaScript syntax, and the complete local migration chain are CI-verifiable.
- LINE login/session reuse and Web Push test delivery still require post-deployment checks on real LINE and PWA devices with production secrets and subscriptions.
