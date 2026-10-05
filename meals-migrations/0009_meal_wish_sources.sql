-- Keep the original LINE recipe link after confirming a food wish.
ALTER TABLE meal_wishlist ADD COLUMN source_url TEXT;
