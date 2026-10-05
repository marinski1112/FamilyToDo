-- Extraction provenance only. No video bytes, transcript, prompts or raw AI responses.
CREATE TABLE recipe_sources (
 family_id INTEGER NOT NULL, recipe_id TEXT NOT NULL, import_id TEXT NOT NULL,
 source_url TEXT NOT NULL, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 confirmed_by INTEGER NOT NULL, confirmed_at TEXT NOT NULL,
 PRIMARY KEY(family_id,recipe_id,import_id),
 FOREIGN KEY(family_id,recipe_id) REFERENCES recipes(family_id,id),
 FOREIGN KEY(family_id,import_id) REFERENCES meal_url_imports(family_id,id)
);
