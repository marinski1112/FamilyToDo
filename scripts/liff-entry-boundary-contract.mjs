import fs from 'node:fs';

const page=fs.readFileSync('src/liff-entry-page.ts','utf8');
const oauth=fs.readFileSync('src/oauth-continuation.ts','utf8');
const target=fs.readFileSync('src/liff-target.ts','utf8');
const browser=fs.readFileSync('public/assets/liff-auth.js','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');

for(const marker of [
  "from './app-shell'",
  "from './liff-target'",
  "from './response'",
  "from './version'",
  'export function liffEntryPage',
  "validateLiffNext(options.next) || '/app/index.php'",
  'https://static.line-scdn.net/liff/edge/2/sdk.js',
  '/assets/liff-auth.js?v=${APP_VERSION}',
]){
  if(!page.includes(marker)) throw new Error(`retained LIFF entry page lost behavior marker: ${marker}`);
}
if(page.includes("from './app'")) throw new Error('retained LIFF entry page must not depend on app.ts');

for(const marker of [
  "tasks: '/app/tasks.php'",
  "calendar: '/app/calendar.php'",
  "shopping: '/app/shopping.php'",
  "'family-log': '/app/family_log.php'",
  "messages: '/app/messages.php'",
  "settings: '/app/settings.php'",
  "location: '/app/location.php'",
  "if (alias && LIFF_PATH_ALIASES[alias]) return LIFF_PATH_ALIASES[alias];",
  "if (stateAlias && LIFF_PATH_ALIASES[stateAlias]) return LIFF_PATH_ALIASES[stateAlias];",
  "if (path.startsWith('/oauth/')) return GOOGLE_CONTINUE.test(path) ? path : null;",
  "const explicit = validateLiffNext(url.searchParams.get('next'));",
]){
  if(!target.includes(marker)) throw new Error(`retained LIFF target lost alias/validation marker: ${marker}`);
}

for(const marker of [
  "location:'/app/location.php'",
  "const loginPath=`/liff?next=${encodeURIComponent(current)}`",
  "window.liff.login({redirectUri:liffRedirect(loginPath)})",
  "fetch('/app/api/liff_login.php'",
]){
  if(!browser.includes(marker)) throw new Error(`browser LIFF routing lost location/session marker: ${marker}`);
}

for(const marker of [
  '"/liff",',
  '"/liff/*"',
]){
  if(!wrangler.includes(marker)) throw new Error(`Wrangler LIFF route must remain Worker-first: ${marker}`);
}

for(const marker of [
  "import { makeContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { liffEntryPage } from './liff-entry-page';",
  'export async function normalLiff',
  'export async function liffDispatcher',
  'export async function resumeGoogleHome',
]){
  if(!oauth.includes(marker)) throw new Error(`OAuth continuation lost retained LIFF dependency marker: ${marker}`);
}
if(oauth.includes("from './app'")) throw new Error('oauth-continuation.ts must not depend directly on app.ts');

console.log('LIFF entry retained boundary contract ok');
