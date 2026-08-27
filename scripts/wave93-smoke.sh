#!/usr/bin/env bash
set -euo pipefail
node <<'NODE'
const fs=require('fs');const app=fs.readFileSync('src/app.ts','utf8');const routes=fs.readFileSync('src/index.ts','utf8');
function ok(v,m){if(!v)throw new Error(m)}
const daily=app.slice(app.indexOf('const dailyBody='),app.indexOf('const sharedControls='));
ok((daily.match(/family-log-gear/g)||[]).length===1,'daily header must have one gear');
ok(!daily.includes('データをインポート')&&!daily.includes('対象追加')&&!daily.includes('表示設定')&&!daily.includes('対象設定'),'management actions leaked into daily page');
ok(!daily.includes('1ページ50件'),'technical page size leaked');
ok(daily.indexOf('family-log-quick-grid')<daily.indexOf('${dashboardHtml}'),'quick record must precede dashboard');
ok(daily.includes('<details class="card family-log-timer-card"'),'timer must be collapsed details');
ok(routes.includes("'/app/settings_family_log.php'"),'management route missing');
ok(routes.includes("'/app/family_log_import.php'"),'import route compatibility missing');
ok(app.includes('show_adult_logs')&&app.includes('settings_update'),'adult visibility missing');
console.log('wave93 family-log UX smoke: ok');
NODE
