import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0043_wave128_calendar_done_retry_normalization.sql','utf8');

assert.match(migration,/UPDATE calendar_sync_outbox/,'normalization must only touch calendar outbox state');
assert.match(migration,/provider\s*=\s*'GOOGLE_CALENDAR'/,'normalization must be Google Calendar only');
assert.match(migration,/status\s*=\s*'DONE'/,'normalization must be restricted to completed rows');
assert.match(migration,/retry_count\s*>=\s*8/,'normalization must target only historical exhausted rows');
assert.match(migration,/SET retry_count\s*=\s*0/,'completed historical retries must be reset');
assert.doesNotMatch(migration,/status\s*=\s*'ERROR'/,'normalization must not mutate active error rows');
assert.doesNotMatch(migration,/UPDATE\s+tasks|DELETE\s+FROM\s+tasks|external_calendar_links|external_calendar_accounts|calendar_sync_state|external_calendar_watch_channels/i,'normalization must not mutate canonical or projection lifecycle state');

console.log('Google Calendar contract: historical DONE retry rows normalize without touching active state');
