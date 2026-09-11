import assert from 'node:assert/strict';

const shouldAdvance=({currentRecordedAt,currentReceivedAt,incomingRecordedAt,incomingReceivedAt})=>
  incomingRecordedAt>currentRecordedAt||
  (incomingRecordedAt===currentRecordedAt&&incomingReceivedAt>currentReceivedAt);

const currentRecordedAt='2026-09-10T10:00:00.000Z';
const currentReceivedAt='2026-09-10T10:00:03.000Z';

assert.equal(shouldAdvance({
  currentRecordedAt,currentReceivedAt,
  incomingRecordedAt:'2026-09-10T10:03:00.000Z',
  incomingReceivedAt:'2026-09-10T10:03:05.000Z',
  currentAccuracy:14,
  incomingAccuracy:1414,
}),true,'a newer accepted coarse fix must replace an older accurate latest');
assert.equal(shouldAdvance({
  currentRecordedAt,currentReceivedAt,
  incomingRecordedAt:'2026-09-10T10:08:00.000Z',
  incomingReceivedAt:'2026-09-10T10:08:04.000Z',
  currentAccuracy:14,
  incomingAccuracy:2000,
}),true,'the observed coarse burst must still advance latest by sensor time');
assert.equal(shouldAdvance({
  currentRecordedAt,currentReceivedAt,
  incomingRecordedAt:'2026-09-10T10:09:00.000Z',
  incomingReceivedAt:'2026-09-10T10:09:02.000Z',
  currentAccuracy:14,
  incomingAccuracy:null,
}),true,'unknown accuracy must not pin an older latest');
assert.equal(shouldAdvance({
  currentRecordedAt,currentReceivedAt,
  incomingRecordedAt:'2026-09-10T09:59:59.000Z',
  incomingReceivedAt:'2026-09-10T10:10:00.000Z',
}),false,'an older sensor timestamp must not replace latest merely because it arrived later');
assert.equal(shouldAdvance({
  currentRecordedAt,currentReceivedAt,
  incomingRecordedAt:currentRecordedAt,
  incomingReceivedAt:'2026-09-10T10:00:04.000Z',
}),true,'receipt time must break equal sensor-time ties');
assert.equal(shouldAdvance({
  currentRecordedAt,currentReceivedAt,
  incomingRecordedAt:currentRecordedAt,
  incomingReceivedAt:'2026-09-10T10:00:02.000Z',
}),false,'an older receipt must not win an equal sensor-time tie');

console.log('location-newest-latest-runtime-contract: newest accepted sensor-time policy cases ok');