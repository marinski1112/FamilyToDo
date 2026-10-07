-- Explicit classification only: existing names are not inferred.
ALTER TABLE recipes ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0 CHECK(is_main IN (0,1));
ALTER TABLE meal_wishlist ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0 CHECK(is_main IN (0,1));
ALTER TABLE meal_cooking_queue ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0 CHECK(is_main IN (0,1));
