-- Intentional one-time reset before the FamilyToDo/Mitenya shared stamp catalog rollout.
--
-- The user explicitly requested that all pre-shared FamilyToDo stamp registrations
-- and their placements/attachments be removed so they cannot be mixed with the
-- new shared catalog. Delete dependants first because the original stamp tables
-- do not use ON DELETE CASCADE for asset references.
--
-- This migration removes D1 metadata only. Managed UPLOAD bytes already stored in
-- R2 are left unreachable and must be garbage-collected separately; keeping that
-- object cleanup outside D1 avoids deleting unrelated MEDIA objects.

DELETE FROM message_stamp_attachments;
DELETE FROM calendar_stamp_placements;
DELETE FROM calendar_stamp_asset_frames;
DELETE FROM calendar_stamp_assets;
