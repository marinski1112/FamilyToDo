-- Optional recipe identity. Do not infer links from names or rewrite existing wishes.
ALTER TABLE meal_wishlist ADD COLUMN recipe_id TEXT;
ALTER TABLE meal_wishlist ADD COLUMN recipe_link_set INTEGER NOT NULL DEFAULT 0 CHECK(recipe_link_set IN (0,1));
CREATE INDEX meal_wishlist_recipe ON meal_wishlist(family_id,recipe_id);
