-- P1 privacy/data-integrity guard: a Web Push subscription must belong to the
-- same family as its member. The original table has independent foreign keys,
-- which do not by themselves enforce this composite tenant relationship.

CREATE TRIGGER IF NOT EXISTS trg_web_push_member_family_insert
BEFORE INSERT ON web_push_subscriptions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM members m
  WHERE m.id = NEW.member_id AND m.family_id = NEW.family_id
)
BEGIN
  SELECT RAISE(ABORT, 'web_push_subscription_member_family_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_web_push_member_family_update
BEFORE UPDATE OF member_id, family_id ON web_push_subscriptions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM members m
  WHERE m.id = NEW.member_id AND m.family_id = NEW.family_id
)
BEGIN
  SELECT RAISE(ABORT, 'web_push_subscription_member_family_mismatch');
END;
