-- Operation receipts for explicitly confirmed shopping completions, not a second shopping list.
-- Deliberately retain the receipt when a shopping item is deleted, preventing replay resurrection.
CREATE TABLE meal_receipt_shopping_confirmations (
 family_id INTEGER NOT NULL, receipt_id TEXT NOT NULL, item_index INTEGER NOT NULL,
 shopping_item_id INTEGER NOT NULL, payload_hash TEXT NOT NULL,
 operation_token TEXT NOT NULL, completed_by INTEGER NOT NULL, completed_at TEXT NOT NULL,
 PRIMARY KEY(family_id,receipt_id,item_index),
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);
