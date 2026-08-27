#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs'),app=fs.readFileSync('src/app.ts','utf8'),js=fs.readFileSync('public/assets/task-events.js','utf8'),fl=fs.readFileSync('public/assets/family-log.js','utf8'),css=fs.readFileSync('public/assets/family.css','utf8'),mig=fs.readFileSync('migrations/0024_wave87_custom_timer.sql','utf8');
const has=(text,value)=>{if(!text.includes(value))throw Error(`missing: ${value}`)};
has(app,'task-main-row');has(app,'shoppingBlock=taskShopping||childItems');has(app,"adultAggregate=showAdultLogs&&subjectParam==='adult'");has(app,"l.created_by=?");has(app,"timer_label");has(app,"String(timer.timer_label||'')");has(js,"classList.toggle('completed',checked)");if(js.includes('expiredRow.remove()'))throw Error('expired row removal remains');if(app.includes('<small>タップで記録</small>'))throw Error('quick chore hint remains');has(css,'flex-direction:row');has(app,"selectedSubject||adultAggregate?'':");has(app,'FAMILY_LOG_SUBJECT_TYPES');has(fl,"PET_PRESETS={CAT:");has(fl,"DOG:['MEAL'");has(fl,"action:'timer_start',log_type:'TIMER'");has(mig,'ADD COLUMN timer_label TEXT NULL');
JS
