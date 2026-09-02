import fs from 'node:fs';

const context=fs.readFileSync('src/app-context.ts','utf8');
const auth=fs.readFileSync('src/auth-health.ts','utf8');
const routes=fs.readFileSync('src/public-routes.ts','utf8');

for(const marker of [
  "from './session'",
  "from './timezone'",
  "from './types'",
  'export interface AppContext',
  'export async function memberById',
  'export async function makeContext',
  "SELECT m.*,COALESCE(f.timezone,?) family_timezone FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=? AND m.active=1 LIMIT 1",
  'openSession(getSessionCookie(request), env.APP_SECRET)',
]){
  if(!context.includes(marker)) throw new Error(`retained app context lost behavior marker: ${marker}`);
}
if(context.includes("from './app'")) throw new Error('retained app context must not depend on app.ts');

for(const marker of [
  "from './app-context'",
  "from './response'",
  'cookie_session:',
  'line_user_id_present:',
  'member_id_present:',
  'family_id_present:',
  'csrf_present:',
  'member_exists:',
  'member_active:',
]){
  if(!auth.includes(marker)) throw new Error(`retained auth health lost marker: ${marker}`);
}
if(auth.includes("from './app'")) throw new Error('auth-health must not depend on app.ts');

if(!routes.includes("import { makeContext } from './app-context';")) throw new Error('public routes must consume retained app context');
if(!routes.includes("import { authHealth } from './auth-health';")) throw new Error('public routes must consume retained auth health');
if(routes.includes("from './app'")) throw new Error('public-routes.ts must not depend directly on app.ts');

console.log('app context retained boundary contract ok');
