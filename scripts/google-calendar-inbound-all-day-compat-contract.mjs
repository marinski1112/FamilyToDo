import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/google-calendar-inbound-preview.ts','utf8');

assert.ok(source.includes("endDateExclusive<startDate"),'reversed all-day ranges must remain invalid');
assert.ok(source.includes("endDateExclusive===startDate?startDate:shiftDate(endDateExclusive,-1)"),'equal all-day start/end dates must normalize as a single day');
assert.ok(!source.includes("endDateExclusive<=startDate"),'equal all-day start/end dates must not be rejected');

console.log('google-calendar-inbound-all-day-compat-contract: zero-length legacy all-day entries normalize as one day while reversed ranges remain blocked');
