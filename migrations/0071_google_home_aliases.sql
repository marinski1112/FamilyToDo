CREATE TABLE google_home_aliases (
  family_id INTEGER NOT NULL REFERENCES families(id),
  scene_id TEXT NOT NULL,
  phrase TEXT NOT NULL CHECK(length(phrase) BETWEEN 1 AND 60),
  phrase_key TEXT NOT NULL,
  updated_by INTEGER NOT NULL REFERENCES members(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(family_id,phrase_key)
);
CREATE INDEX idx_google_home_alias_scene ON google_home_aliases(family_id,scene_id);
