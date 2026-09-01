import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/environment-health.ts',import.meta.url),'utf8');
const marker='export const integrationsHealthResponse=';
const start=source.indexOf(marker);
if(start<0)throw new Error('public integrations health response export is missing');
const publicSlice=source.slice(start);
if(!/json\(\{ok:true,service:'familytodo-integrations'\}\)/.test(publicSlice))throw new Error('public integrations health response must remain aggregate-only');
for(const sensitive of ['client_id_present','client_secret_present','token_key_present','deployment_id_present','GOOGLE_','LINE_','VAPID_','GEMINI_','FAMILY_AI_PROVIDER','EXPECTED_CONFIG','APP_VERSION']){
  if(publicSlice.includes(sensitive))throw new Error(`public integrations health response leaks configuration metadata: ${sensitive}`);
}
if(!/export function integrationsHealth\(env:Env\)/.test(source))throw new Error('authenticated/internal integration diagnostics were removed');
console.log('public integrations health privacy contract ok');
