import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0045_calendar_animated_stamps.sql','utf8');
const frameMigration=fs.readFileSync('migrations/0046_calendar_stamp_png_frames.sql','utf8');

for(const token of [
  'CREATE TABLE calendar_stamp_assets',
  "asset_kind IN ('ANIMATED','STATIC')",
  "mime_type IN ('image/gif','image/webp','image/png')",
  "storage_provider IN ('ASSETS','UPLOAD')",
  "instr(lower(storage_key),'://')=0",
  "lower(storage_key) NOT LIKE 'data:%'",
  "instr(lower(thumbnail_storage_key),'://')=0",
  'UNIQUE(family_id,storage_provider,storage_key)',
  'CREATE TRIGGER calendar_stamp_assets_family_insert',
  'CREATE TRIGGER calendar_stamp_assets_family_update',
  'SELECT 1 FROM members WHERE id=NEW.created_by AND family_id=NEW.family_id',
  'CREATE TABLE calendar_stamp_placements',
  "visibility_scope IN ('FAMILY','PRIVATE')",
  "visibility_scope='PRIVATE' AND private_owner_id IS NOT NULL",
  'FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id)',
  'CREATE TRIGGER calendar_stamp_placements_family_insert',
  'CREATE TRIGGER calendar_stamp_placements_family_update',
  'SELECT 1 FROM calendar_stamp_assets WHERE id=NEW.asset_id AND family_id=NEW.family_id',
  'SELECT 1 FROM members WHERE id=NEW.private_owner_id AND family_id=NEW.family_id',
  'idx_calendar_stamp_placements_family_date',
]) assert.ok(migration.includes(token),`calendar stamp foundation missing: ${token}`);

for(const token of [
  'CREATE TABLE calendar_stamp_asset_frames',
  'frame_index INTEGER NOT NULL CHECK(frame_index BETWEEN 0 AND 47)',
  'duration_ms INTEGER NOT NULL DEFAULT 120 CHECK(duration_ms BETWEEN 40 AND 2000)',
  'UNIQUE(asset_id,frame_index)',
  'FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id)',
  'idx_calendar_stamp_asset_frames_family_asset',
  'CREATE TRIGGER calendar_stamp_asset_frames_family_insert',
  'CREATE TRIGGER calendar_stamp_asset_frames_family_update',
  "asset_kind='ANIMATED' AND mime_type='image/png'",
  "RAISE(ABORT,'calendar stamp frame asset mismatch')",
]) assert.ok(frameMigration.includes(token),`calendar PNG frame foundation missing: ${token}`);

assert.doesNotMatch(migration,/calendar_id/i,'calendar stamps must not couple to Google Calendar schedule identifiers');
assert.doesNotMatch(frameMigration,/calendar_id|private_owner_id|created_by/i,'PNG frame metadata must stay asset-scoped and must not duplicate placement identity');
assert.doesNotMatch(frameMigration,/https?:|data:/i,'PNG frame persistence must store opaque same-provider keys rather than remote or embedded URLs');

console.log('calendar animated stamps foundation contract: tenant-safe assets/placements plus bounded ordered PNG-frame metadata and storage-provider extensibility ok');
