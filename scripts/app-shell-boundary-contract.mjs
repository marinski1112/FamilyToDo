import fs from 'node:fs';

const shell=fs.readFileSync('src/app-shell.ts','utf8');
const activity=fs.readFileSync('src/activity-log-page.ts','utf8');

for(const marker of [
  "export function layout",
  "from './version'",
  "'/app/tasks.php'",
  "'/app/calendar.php'",
  "'/app/location.php'",
  "'/app/family_log.php'",
  "'/app/messages.php'",
  "'/app/settings.php'",
  'native-control-shell',
  '/assets/family.css?v=${APP_VERSION}',
  '/assets/pwa.js?v=${APP_VERSION}',
  'viewport-fit=cover',
  'data-bottom-nav-viewport-fix="1"',
  '--nav-safe-top:env(safe-area-inset-top,0px)',
  '--nav-safe-bottom:env(safe-area-inset-bottom,0px)',
  '--nav-safe-left:env(safe-area-inset-left,0px)',
  '--nav-safe-right:env(safe-area-inset-right,0px)',
  '--nav-box-h:calc(var(--nav-h) + var(--nav-safe-bottom))',
  'body{padding-bottom:0}',
  '.wrap{padding-top:calc(18px + var(--nav-safe-top))!important;padding-left:var(--nav-safe-left)!important;padding-right:var(--nav-safe-right)!important;padding-bottom:calc(var(--nav-box-h) + 30px)!important}',
  'height:var(--nav-box-h)!important',
  'min-height:var(--nav-box-h)!important',
  'padding-left:calc(8px + var(--nav-safe-left))!important',
  'padding-right:calc(8px + var(--nav-safe-right))!important',
  'padding-bottom:calc(7px + var(--nav-safe-bottom))!important',
  'transform:none!important',
  '-webkit-transform:none!important',
  'will-change:auto!important',
  '.fab{right:calc(16px + var(--nav-safe-right))!important;bottom:calc(var(--nav-box-h) + 14px)!important}',
]){
  if(!shell.includes(marker)) throw new Error(`app shell lost behavior marker: ${marker}`);
}
if(shell.includes("['/app/shopping.php','🛒','買い物']")) throw new Error('Shopping must no longer occupy the bottom-navigation slot');

if(!activity.includes("import { layout } from './app-shell';")){
  throw new Error('activity-log-page must consume the retained app shell');
}
if(activity.includes("from './app'")){
  throw new Error('activity-log-page must not reach into app.ts');
}

console.log('app shell retained boundary contract ok');
