import fs from 'node:fs';

const source=fs.readFileSync('src/location-owntracks-ingress.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');

for(const required of [
  "import { verifyLocationDeviceCredential } from './location-device-auth';",
  "import { normalizeOwnTracksLocation } from './location-owntracks';",
  "import { persistAuthenticatedLocationPoint } from './location-persistence';",
  "const MAX_BODY_BYTES=16*1024;",
  "if(request.method!=='POST')",
  "request.headers.get('authorization')",
  "header.startsWith(BASIC_PREFIX)",
  "verifyLocationDeviceCredential(env.DB,credential.publicId,credential.secret)",
  "device.provider!=='OWNTRACKS'",
  "new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES",
  "normalizeOwnTracksLocation(payload,{",
  "familyId:device.familyId",
  "memberId:device.memberId",
  "deviceId:device.publicId",
  "persistAuthenticatedLocationPoint(env.DB,device,normalized.point)",
  "if(!persisted)return unauthorized();",
  "return json([]);",
]) if(!source.includes(required)) throw new Error(`OwnTracks ingress contract missing: ${required}`);

for(const forbidden of [
  '.searchParams',
  'console.log',
  'console.error',
  'JSON.stringify(payload)',
  'normalized.point.latitude',
  'normalized.point.longitude',
]) if(source.includes(forbidden)) throw new Error(`OwnTracks ingress privacy boundary regressed: ${forbidden}`);

if(!source.includes("{'www-authenticate':'Basic realm=\"FamilyToDo Location\"'}")) throw new Error('OwnTracks ingress must advertise HTTP Basic authentication');
if(!source.includes("if(body.length===0)return json([]);")) throw new Error('authenticated zero-length OwnTracks POST must be a no-op');
if(!source.includes("JSON.parse(body)")) throw new Error('OwnTracks ingress must parse bounded JSON locally');
if(!source.includes("code:'INVALID_JSON'")) throw new Error('invalid JSON must return a fixed safe code');
if(!source.includes("code:'INVALID_LOCATION'")) throw new Error('normalizer errors must not echo raw payload details');

for(const required of [
  "import { ownTracksLocationIngress } from './location-owntracks-ingress';",
  "if(url.pathname==='/api/location/owntracks') return await ownTracksLocationIngress(request,env);",
]) if(!publicRoutes.includes(required)) throw new Error(`OwnTracks public route wiring missing: ${required}`);

console.log('location OwnTracks ingress contract: ok');
