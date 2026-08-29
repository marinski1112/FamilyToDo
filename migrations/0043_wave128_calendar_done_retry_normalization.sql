-- Wave128 fix16: normalize historical Google Calendar outbox rows that were
-- already finalized as DONE after reaching the old retry ceiling.
--
-- These rows are no longer failures. Keeping retry_count >= 8 caused the
-- settings summary to render a stale "sync failed / retry" affordance even
-- though projection diagnostics correctly reported ERROR 0.
--
-- Do not touch active ERROR/PENDING work, canonical tasks, projection links,
-- calendar account state, sync tokens, or watch channels.
UPDATE calendar_sync_outbox
SET retry_count = 0,
    last_error = NULL
WHERE provider = 'GOOGLE_CALENDAR'
  AND status = 'DONE'
  AND retry_count >= 8;
