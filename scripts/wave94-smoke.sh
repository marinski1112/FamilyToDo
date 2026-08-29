#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs');
const app=fs.readFileSync('src/app.ts','utf8'),js=fs.readFileSync('public/assets/family-log.js','utf8')+fs.readFileSync('public/assets/family-log-core.js','utf8'),css=fs.readFileSync('public/assets/family.css','utf8'),mig=fs.readFileSync('migrations/0030_wave94_family_log_overview.sql','utf8');
const has=(s,x)=>{if(!s.includes(x))throw Error(`missing: ${x}`)};
has(app,'All-view intentionally does not union'); has(app,'familyLogOverviewQuickTypes'); has(app,"action==='sleep_start'"); has(app,"action==='sleep_stop'"); has(app,"action==='sleep_adjust'"); has(app,"subject_kind IN ('BABY','CHILD')"); has(app,"log_type='SLEEP'"); has(app,'SLEEP_TIMER_WARNING_MINUTES'); has(app,'SLEEP_TIMER_CONFIRM_MINUTES'); has(app,'SLEEP_TIMER_MAX_ADJUST_MINUTES'); has(app,"type!=='TIMER'"); has(app,'family_log_import_batches'); has(app,"countFor('SLEEP')");
has(js,"action:'sleep_start'"); has(js,"action:'sleep_stop'"); has(js,"action:'sleep_adjust'"); has(css,'height:44px'); has(css,'font-size:17px'); has(css,'font-size:12px'); has(mig,'DEFAULT 0'); has(mig,'overview_quick_types_json');
if(app.includes(':FAMILY_LOG_TYPES.filter(type=>(adultAggregate?adultSubjects'))throw Error('all-view enabled type union remains');
console.log('wave94 overview/sleep smoke: ok');
JS
