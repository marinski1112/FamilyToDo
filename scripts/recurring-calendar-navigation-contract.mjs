import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const calendar=fs.readFileSync(new URL('../public/assets/calendar.js',import.meta.url),'utf8');

const failures=[];
const requireMatch=(source,re,label)=>{if(!re.test(source))failures.push(label);};

// Recurrence occurrences are still represented internally by a negative synthetic id.
requireMatch(app,/id:-Number\(occ\.id\)/,'recurringForDate must continue exposing the occurrence synthetic id expected by calendar rendering');

// Calendar UI must translate every negative band id into recurrence navigation metadata
// instead of allowing /task/view.php?id=-N links to escape into the browser.
requireMatch(calendar,/function repairRecurringBandLinks\(root\)/,'calendar must repair recurring band links');
requireMatch(calendar,/syntheticId<0&&ruleId>0/,'repair map must only register negative recurring synthetic ids with a real rule id');
requireMatch(calendar,/params=new URLSearchParams\(\{edit:String\(row\.recurrence_rule_id\)\}\)/,'recurring band navigation must target the recurrence rule editor');
requireMatch(calendar,/link\.href='\/app\/recurring\.php\?'\+params\.toString\(\)/,'negative recurring band href must be rewritten to recurring.php');
requireMatch(calendar,/repairRecurringBandLinks\(document\.querySelector\('\.calendar-grid'\)\)/,'initial month render must repair recurring band links');
requireMatch(calendar,/repairRecurringBandLinks\(gridNow\)/,'AJAX month replacement must repair recurring band links');
requireMatch(calendar,/t\.recurring\?'\/app\/recurring\.php\?'/,'day-detail recurring rows must navigate directly to recurring.php');

if(/\/task\/view\.php\?id='\+encodeURIComponent\(t\.id\)/.test(calendar) && !/t\.recurring\?'\/app\/recurring\.php\?'/.test(calendar)){
  failures.push('task view fallback is reachable for recurring rows');
}

if(failures.length){
  console.error('Recurring calendar navigation contract failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Recurring calendar navigation contract: ok');
