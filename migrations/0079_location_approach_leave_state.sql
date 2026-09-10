-- Extend the existing arrival-notification state machine without rewriting prior migration 0069.
-- Existing legacy IN/OUT rows remain valid; application code derives phase from state when phase is NULL.
ALTER TABLE location_arrival_states ADD COLUMN phase TEXT CHECK(phase IS NULL OR phase IN ('OUTSIDE','APPROACHING','INSIDE'));
ALTER TABLE location_arrival_states ADD COLUMN pending_phase TEXT CHECK(pending_phase IS NULL OR pending_phase IN ('OUTSIDE','APPROACHING','INSIDE'));
ALTER TABLE location_arrival_states ADD COLUMN last_approach_at TEXT;
ALTER TABLE location_arrival_states ADD COLUMN last_leave_at TEXT;

-- Keep the legacy table name for compatibility, but identify the new delivery semantics explicitly.
ALTER TABLE location_arrival_deliveries ADD COLUMN event_type TEXT CHECK(event_type IS NULL OR event_type IN ('APPROACH','LEAVE'));
CREATE INDEX IF NOT EXISTS idx_location_arrival_delivery_event_recent
  ON location_arrival_deliveries(family_id, recipient_id, event_type, id DESC);
