import fs from 'node:fs';

// Branch-only exact-source patcher; removed before PR.
const path='src/google-home.ts';
const source=fs.readFileSync(path,'utf8');
const oldText="const access=await refreshedAccessToken(env,row,now);console.log(JSON.stringify({category:'GOOGLE_HOME_TOKEN_REFRESHED',family_id:row.family_id,member_id:row.member_id,stage:'token',result:'success'}));";
const newText="const access=await refreshedAccessToken(env,row,now);console.log(JSON.stringify({category:'GOOGLE_HOME_TOKEN_REFRESHED',provider:'GOOGLE_HOME',stage:'token',result:'success'}));";
if(!source.includes(oldText))throw new Error('expected Google Home refresh log source not found');
if(source.indexOf(oldText)!==source.lastIndexOf(oldText))throw new Error('Google Home refresh log source matched more than once');
fs.writeFileSync(path,source.replace(oldText,newText));