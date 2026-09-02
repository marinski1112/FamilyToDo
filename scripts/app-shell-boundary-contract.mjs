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
