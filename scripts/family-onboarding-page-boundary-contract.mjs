import fs from 'node:fs';

const page=fs.readFileSync('src/family-onboarding-page.ts','utf8');
const handlers=fs.readFileSync('src/auth-page-handlers.ts','utf8');

for(const marker of [
  "from './app-context'",
  "from './app-shell'",
  "from './response'",
  "from './version'",
  'export async function createFamilyPage',
  'ctx.session.lineDisplayName',
  'data-family-endpoint="/api/family/create"',
  'data-family-endpoint="/api/family/join"',
  'family_name',
  'family_code',
  '/assets/family-onboarding.js?v=${APP_VERSION}',
]){
  if(!page.includes(marker)) throw new Error(`family onboarding page lost behavior marker: ${marker}`);
}
if(page.includes("from './app'")) throw new Error('family onboarding page must not depend on app.ts');
if(!handlers.includes("export { createFamilyPage } from './family-onboarding-page';")) throw new Error('auth page handlers must route createFamilyPage through retained onboarding module');
const directAppCreate=handlers.split('\n').find(line=>line.includes("from './app'")&&line.includes('createFamilyPage'));
if(directAppCreate) throw new Error(`createFamilyPage must not be re-exported from app.ts: ${directAppCreate}`);

console.log('family onboarding page retained boundary contract ok');
