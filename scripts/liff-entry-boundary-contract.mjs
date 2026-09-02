import fs from 'node:fs';

const page=fs.readFileSync('src/liff-entry-page.ts','utf8');
const oauth=fs.readFileSync('src/oauth-continuation.ts','utf8');

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
