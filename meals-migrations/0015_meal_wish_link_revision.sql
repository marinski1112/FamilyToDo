-- Reject stale saves after an explicit unlink/change; migration 0014 remains immutable.
ALTER TABLE meal_wishlist ADD COLUMN recipe_link_revision INTEGER NOT NULL DEFAULT 0;
