-- Mirror the proven Belongings checklist idempotency contract for Shopping rows
-- created by reusable-set invocation. Existing Shopping rows remain NULL and unchanged.
ALTER TABLE shopping_items ADD COLUMN client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_items_family_client_request_id
  ON shopping_items(family_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND length(trim(client_request_id)) > 0;
