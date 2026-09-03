import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root=process.cwd();
const domainPath=path.join(root,'src/location-domain.ts');
const adapterPath=path.join(root,'src/location-owntracks.ts');
const [domainSource,adapterSource]=await Promise.all([
  fs.readFile(domainPath,'utf8'),
  fs.readFile(adapterPath,'utf8'),
]);

const transpile=(source,fileName)=>ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
  fileName,
}).outputText;
const domainJs=transpile(domainSource,'location-domain.ts');
const domainUrl=`data:text/javascript;base64,${Buffer.from(domainJs).toString('base64')}`;
const adapterJs=transpile(adapterSource,'location-owntracks.ts')
  .replace("from './location-domain'",`from '${domainUrl}'`);
const adapterUrl=`data:text/javascript;base64,${Buffer.from(adapterJs).toString('base64')}`;
const {normalizeOwnTracksLocation}=await import(adapterUrl);

const receivedAt='2026-09-04T03:00:00.000Z';
const receivedSeconds=Math.floor(Date.parse(receivedAt)/1000);
const context={familyId:7,memberId:11,deviceId:'phone-main',receivedAt};
const validPayload={
  _type:'location',
  lat:35.681236,
  lon:139.767125,
  tst:receivedSeconds-30,
  acc:8,
  alt:42,
  vel:36,
  cog:180,
  batt:87,
  t:'u',
  topic:'owntracks/should/not/leak',
  secret:'never-copy-raw-fields',
};

const valid=normalizeOwnTracksLocation(validPayload,context);
assert.equal(valid.ok,true);
assert.deepEqual(valid.point,{
  provider:'OWNTRACKS',familyId:7,memberId:11,deviceId:'phone-main',
  latitude:35.681236,longitude:139.767125,
  recordedAt:new Date((receivedSeconds-30)*1000).toISOString(),receivedAt,
  trigger:'MANUAL',accuracyMeters:8,altitudeMeters:42,
  speedMetersPerSecond:10,headingDegrees:180,batteryPercent:87,
});
assert.equal(JSON.stringify(valid).includes('never-copy-raw-fields'),false);
assert.equal(JSON.stringify(valid).includes('owntracks/should/not/leak'),false);

const automatic=normalizeOwnTracksLocation({...validPayload,t:undefined,batt:-1},context);
assert.equal(automatic.ok,true);
assert.equal(automatic.point.trigger,'MOVE');
assert.equal('batteryPercent' in automatic.point,false);
const ping=normalizeOwnTracksLocation({...validPayload,t:'p'},context);
assert.equal(ping.ok,true);
assert.equal(ping.point.trigger,'PING');
const regionLocation=normalizeOwnTracksLocation({...validPayload,t:'c'},context);
assert.equal(regionLocation.ok,true);
assert.equal(regionLocation.point.trigger,'UNKNOWN');

const rejected=[
  [null,'MALFORMED_PAYLOAD'],
  [{...validPayload,_type:'transition'},'UNSUPPORTED_TYPE'],
  [{...validPayload,lat:91},'INVALID_COORDINATES'],
  [{...validPayload,lon:'139.7'},'INVALID_COORDINATES'],
  [{...validPayload,tst:0},'INVALID_TIMESTAMP'],
  [{...validPayload,tst:receivedSeconds+301},'FUTURE_TIMESTAMP'],
  [{...validPayload,acc:-1},'INVALID_TELEMETRY'],
  [{...validPayload,vel:-1},'INVALID_TELEMETRY'],
  [{...validPayload,cog:361},'INVALID_TELEMETRY'],
  [{...validPayload,batt:101},'INVALID_TELEMETRY'],
];
for(const [payload,code] of rejected){
  assert.deepEqual(normalizeOwnTracksLocation(payload,context),{ok:false,code});
}
assert.deepEqual(
  normalizeOwnTracksLocation(validPayload,{...context,familyId:0}),
  {ok:false,code:'INVALID_CONTEXT'},
);
assert.deepEqual(
  normalizeOwnTracksLocation(validPayload,{...context,receivedAt:'not-a-date'}),
  {ok:false,code:'INVALID_CONTEXT'},
);

for(const payload of rejected.map(([value])=>value)){
  const result=normalizeOwnTracksLocation(payload,context);
  if(!result.ok)assert.deepEqual(Object.keys(result).sort(),['code','ok']);
}

console.log('location OwnTracks normalizer contract: ok');
