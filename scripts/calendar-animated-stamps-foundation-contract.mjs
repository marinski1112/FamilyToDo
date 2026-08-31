import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0045_calendar_animated_stamps.sql','utf8');

for(const token of [
  'CREATE TABLE calendar_stamp_assets',
  "asset_kind IN ('ANIMATED','STATIC')",
  "mime_type IN ('image/gif','image/webp','image/png')",
  "storage_provider IN ('ASSETS','UPLOAD')",
  'UNIQUE(family_id,storage_provider,storage_key)',
  'CREATE TABLE calendar_stamp_placements',
  "visibility_scope IN ('FAMILY','PRIVATE')",
  "visibility_scope='PRIVATE' AND private_owner_id IS NOT NULL",
  'FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id)',
  'idx_calendar_stamp_placements_family_date',
]) assert.ok(migration.includes(token),`calendar stamp foundation missing: ${token}`);

assert.doesNotMatch(migration,/https?:\/\//i,'stamp persistence must store opaque storage keys rather than arbitrary remote URLs');
assert.doesNotMatch(migration,/calendar_id/i,'calendar stamps must not couple to Google Calendar schedule identifiers');

console.log('calendar animated stamps foundation contract: family-scoped assets, animation-capable formats, privacy-safe placements, and storage-provider extensibility ok');
