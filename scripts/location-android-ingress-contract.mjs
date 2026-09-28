import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const ingress=await readFile(new URL('../src/location-android-ingress.ts',import.meta.url),'utf8');
const routes=await readFile(new URL('../src/public-routes.ts',import.meta.url),'utf8');
const settings=await readFile(new URL('../public/assets/settings-location.js',import.meta.url),'utf8');
for(const pattern of [
  /verifyLocationDeviceCredential\(env\.DB,match\[1\],match\[2\]\)/,
  /device\.provider!=='FAMILYTODO_ANDROID'/,
  /new TextEncoder\(\)\.encode\(body\)\.byteLength>MAX_BODY_BYTES/,
  /recordedMs>receivedMs\+5\*60_000/,
  /persistAuthenticatedLocationPoint\(env\.DB,device,point\)/,
  /execution\?\.waitUntil\(processLocationArrival/,
  /'cache-control':'no-store'/,
]) assert.match(ingress,pattern);
assert.doesNotMatch(ingress,/searchParams|console\.|secret_hash|JSON\.stringify\(input\)/);
assert.match(routes,/url\.pathname==='\/api\/location\/android'.*androidLocationIngress\(request,env,ctx\)/);
assert.match(settings,/provisionDevice\('FAMILYTODO_ANDROID'\)/);
console.log('Android location ingress contract: ok');
