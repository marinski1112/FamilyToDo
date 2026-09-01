import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/google-home.ts',import.meta.url),'utf8');
const marker="category:'GOOGLE_HOME_TOKEN_REFRESHED'";
const markerIndex=source.indexOf(marker);
if(markerIndex<0)throw new Error('Google Home refresh success log marker is missing');
if(markerIndex!==source.lastIndexOf(marker))throw new Error('Google Home refresh success log marker must remain singular');
const start=Math.max(0,source.lastIndexOf('const access=',markerIndex));
const end=source.indexOf('return json(',markerIndex);
if(end<0)throw new Error('Google Home refresh response boundary is missing');
const logSlice=source.slice(start,end);
for(const sensitive of ['family_id','member_id','access_token','refresh_token','authorization','cookie','name','title','description','message']){
  if(logSlice.toLowerCase().includes(sensitive))throw new Error(`Google Home refresh log leaks sensitive/identifying field: ${sensitive}`);
}
if(!/GOOGLE_HOME_TOKEN_REFRESHED[\s\S]*provider:'GOOGLE_HOME'[\s\S]*stage:'token'[\s\S]*result:'success'/.test(logSlice))throw new Error('Google Home refresh log must remain bounded aggregate metadata only');
console.log('google home refresh log privacy contract ok');
