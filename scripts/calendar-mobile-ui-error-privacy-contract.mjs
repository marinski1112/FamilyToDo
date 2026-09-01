import fs from 'node:fs';

const source=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const fail=message=>{console.error(message);process.exitCode=1};

if(!source.includes("document.documentElement.dataset.calendarMobileUi='error'"))fail('Calendar mobile UI must retain a bounded failure state');
if(!source.includes("console.error('[calendar-mobile-ui] initialization failed');"))fail('Calendar mobile UI must log only the fixed initialization marker');
if(/catch\s*\(\s*(?:error|err|e)\s*\)[\s\S]{0,240}console\.(?:error|warn|log)\([^\n;]*(?:error|err|e)\b/.test(source))fail('Calendar mobile UI must not forward arbitrary caught exceptions to console');
for(const forbidden of ['payload','cookie','token','title','description','family_id','member_id']){
  const pattern=new RegExp(`console\\.(?:error|warn|log)\\([^\\n;]*\\b${forbidden}\\b`,'i');
  if(pattern.test(source))fail(`Calendar mobile UI console logging must not include ${forbidden}`);
}
if(!process.exitCode)console.log('calendar-mobile-ui-error-privacy contract ok');
