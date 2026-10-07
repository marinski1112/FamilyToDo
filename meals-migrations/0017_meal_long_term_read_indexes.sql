-- Additive only: retain domain history and idempotency receipts.
CREATE INDEX meal_queue_active_order ON meal_cooking_queue(family_id,created_at,id) WHERE status='ACTIVE';
CREATE INDEX meal_queue_history_order ON meal_cooking_queue(family_id,updated_at DESC,id) WHERE status!='ACTIVE';
CREATE INDEX meal_queue_completed_date ON meal_cooking_queue(family_id,completed_at,id) WHERE status='COOKED';
CREATE INDEX meal_queue_pending_jobs ON meal_queue_shopping_jobs(family_id,created_at,id) WHERE status='PENDING';
CREATE INDEX meal_wishlist_pending_order ON meal_wishlist(family_id,created_at DESC,id) WHERE status='PENDING';
CREATE INDEX meal_wishlist_rejected_order ON meal_wishlist(family_id,decision_at DESC,id) WHERE status='REJECTED';
CREATE INDEX meal_recipes_active_order ON recipes(family_id,updated_at DESC,id) WHERE archived=0;
CREATE INDEX meal_url_import_payload_day ON meal_url_imports(family_id,payload_hash,created_at);
CREATE INDEX meal_inventory_active_order ON inventory_lots(family_id,(expires_on IS NULL),expires_on,purchased_on,id) WHERE archived=0;
