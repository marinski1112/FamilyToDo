import fs from 'node:fs';

const css=fs.readFileSync('public/assets/family-log-density.css','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
for(const marker of [
  '.family-log-page .family-log-compact-toolbar',
  '.family-log-page .family-log-timeline',
  'height:74px!important',
  'height:58px!important',
  'padding-bottom:122px!important',
])if(!css.includes(marker))throw new Error(`Family Log density marker missing: ${marker}`);
if(!shell.includes('/assets/family-log-density.css?v=${APP_VERSION}-density1'))throw new Error('Family Log density stylesheet is not loaded by app shell');
console.log('family-log-density: compact toolbar/timeline join and short quick-entry dock ok');
