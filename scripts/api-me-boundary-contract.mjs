import fs from 'node:fs';

const handler=fs.readFileSync('src/api-me.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { json } from './response';",
  'export async function apiMe(ctx:AppContext):Promise<Response>{',
  "json({ok:true,authenticated:false})",
  "SELECT id,name,family_code FROM families WHERE id=?",
  "json({ok:true,authenticated:true,member:ctx.member,family})",
]){
  if(!handler.includes(marker)) throw new Error(`apiMe retained handler lost behavior marker: ${marker}`);
}
if(handler.includes("from './app'")) throw new Error('apiMe retained handler must not depend on app.ts');
if(!routes.includes("import { apiMe } from './api-me';")) throw new Error('context API dispatcher must import retained apiMe handler');
if(!routes.includes("if(url.pathname==='/api/me') return await apiMe(context);")) throw new Error('/api/me route wiring changed');
const appImport=routes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bapiMe\b/.test(appImport)) throw new Error('context API dispatcher must not import apiMe from app.ts');

console.log('api me retained boundary contract ok');
