-- Bound recipe catalogue pages by family, visibility and name without a temporary sort.
CREATE INDEX meal_recipes_catalog_order ON recipes(family_id,archived,name,id);
