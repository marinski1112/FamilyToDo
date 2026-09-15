# Shared stamp physical cleanup participant (draft)

This is the FamilyToDo companion to marinski1112/mitenya#439. It is not yet an
enabled admin feature. Do not manually deploy it as a finished deletion feature.

The user authorized global deletion of the selected shared identity, including
FamilyToDo originals, thumbnails, every animation frame, every mapped version
and materialized copies. Existing calendar/message placements remain as deleted
placeholders; unrelated identities and family/private permissions must survive.

Implemented:
- Additive local migration 0083 creates durable deletion state, object journals,
  admission records, source identities and SQL resurrection/placement guards.
- The cleanup participant requires confirmed central deletion, captures every
  mapped asset/version/family plus recorded failed-publication sources, physically
  deletes up to 100 private R2 objects per call and clears completed key journals.
- Soft-disabled assets are included. Static ASSETS are never treated as R2 keys.
- Import destinations are recorded before puts. Active import/publish operations
  prevent cleanup from completing. Failed ref attachment does not lose source or
  destination identity. Repeating after an unknown delete result is idempotent.
- If another unrelated local stamp uses the same original file/frame, cleanup
  remains pending rather than silently breaking it. Explicit reconciliation or
  preserving that other identity's copy is still needed for that edge case.

Remaining before rollout:
- Server-verified admin approvals and cross-app cleanup/receipt endpoints.
- Identical management UI confirmation/progress/retry controls and deleted
  placeholders; no delete control is added by this foundation.
- Enforce deleted-state checks in picker/media/placement read paths and clear
  app caches. Legacy cached/downloaded image bytes cannot be remotely recalled.
- Recovery policy for interrupted admissions and pre-migration untracked orphan
  copies. Do not claim these have been inventoried or erased.
- Complete manual shared Worker bundle, migration/deployment ordering, browser
  and production verification. Existing credentials/flags/Cron remain unchanged.

Validation uses actual stamp migrations with disposable SQLite and fake R2 failure
injection, wired into the existing regression suite. No production DB or R2 data
is used. The Mitenya counterpart additionally has disposable Miniflare D1/R2 tests.
