import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const marker="if(url.pathname==='/__cf/secrets-health')";
const start=source.indexOf(marker);
if(start<0)throw new Error('public secrets health route is missing');
const routeEnd=source.indexOf("if(url.pathname==='/__cf/db-health')",start);
if(routeEnd<=start)throw new Error('public secrets health route boundary is missing');
const publicSlice=source.slice(start,routeEnd);
const responseStart=publicSlice.indexOf('return json(');
if(responseStart<0)throw new Error('public secrets health response is missing');
const responseSlice=publicSlice.slice(responseStart);
if(!/return json\(\{ok:true,service:'familytodo-secrets'\}\)/.test(responseSlice))throw new Error('public secrets health response must remain aggregate-only');
for(const sensitive of ['APP_SECRET','LINE_ACCESS_TOKEN','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_LOGIN_CHANNEL_ID','LINE_LOGIN_CHANNEL_SECRET','LINE_LIFF_ID','NOTIFY_SECRET','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','present','length','secrets:','ENVIRONMENT','worker:']){
  if(responseSlice.includes(sensitive))throw new Error(`public secrets health response leaks configuration metadata: ${sensitive}`);
}
console.log('public secrets health privacy contract ok');
