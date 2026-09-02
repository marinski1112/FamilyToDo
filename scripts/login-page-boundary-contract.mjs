import fs from 'node:fs';

const boundary=fs.readFileSync('src/auth-page-handlers.ts','utf8');
const login=fs.readFileSync('src/login-page.ts','utf8');

if(!boundary.includes("export { loginPage } from './login-page';")){
  throw new Error('auth page boundary must route loginPage through login-page.ts');
}
if(/export\s*\{[^}]*loginPage[^}]*\}\s*from\s*['"]\.\/app['"]/.test(boundary)){
  throw new Error('loginPage must not be re-exported from app.ts');
}
for(const marker of [
  "from './app-shell'",
  "from './liff-target'",
  "from './response'",
  "from './version'",
  'validateLiffNext(nextPath)',
  "'/app/index.php'",
  'liffAuthPayload',
  'static.line-scdn.net/liff/edge/2/sdk.js',
  '/assets/liff-auth.js?v=${APP_VERSION}',
]){
  if(!login.includes(marker)) throw new Error(`retained login page lost behavior marker: ${marker}`);
}
if(login.includes("from './app'")) throw new Error('retained login page must not depend on app.ts');

console.log('login page retained boundary contract ok');
