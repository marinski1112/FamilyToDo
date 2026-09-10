import assert from 'node:assert/strict';

const GOOD_METERS=100;
const PROTECTION_SECONDS=30*60;
const shouldAdvance=({currentAccuracy,incomingAccuracy,ageSeconds})=>
  currentAccuracy==null||currentAccuracy>GOOD_METERS||
  (incomingAccuracy!=null&&incomingAccuracy<=GOOD_METERS)||
  ageSeconds>PROTECTION_SECONDS;

assert.equal(shouldAdvance({currentAccuracy:14,incomingAccuracy:1414,ageSeconds:180}),false,'3-minute 1.4km fix must not displace 14m latest');
assert.equal(shouldAdvance({currentAccuracy:14,incomingAccuracy:2000,ageSeconds:8*60}),false,'observed 8-minute poor burst must remain suppressed from latest');
assert.equal(shouldAdvance({currentAccuracy:14,incomingAccuracy:null,ageSeconds:10*60}),false,'unknown-accuracy transient must not displace recent good latest');
assert.equal(shouldAdvance({currentAccuracy:37,incomingAccuracy:7,ageSeconds:180}),true,'new good fix must advance normally');
assert.equal(shouldAdvance({currentAccuracy:1414,incomingAccuracy:2000,ageSeconds:180}),true,'already-coarse latest must not be pinned');
assert.equal(shouldAdvance({currentAccuracy:null,incomingAccuracy:1414,ageSeconds:180}),true,'unknown current quality must not be pinned');
assert.equal(shouldAdvance({currentAccuracy:14,incomingAccuracy:1414,ageSeconds:1801}),true,'coarse fix must advance after the established 30-minute AGING window');

console.log('location-quality-aware-latest-runtime-contract: observed coarse burst policy cases ok');
