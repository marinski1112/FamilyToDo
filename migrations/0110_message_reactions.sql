CREATE TABLE IF NOT EXISTS message_reaction_settings (
  family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  emojis_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS message_reactions (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (family_id,message_id,member_id,emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_member ON message_reactions(family_id,member_id,message_id);
