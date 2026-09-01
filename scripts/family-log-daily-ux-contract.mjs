import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('src/app.ts');
const routes=read('src/page-routes.ts');
const dailyStart=app.indexOf('const dailyBody=');
const dailyEnd=app.indexOf('const sharedControls=');
assert.ok(dailyStart>=0&&dailyEnd>dailyStart,'Family Log daily body boundaries missing');
const daily=app.slice(dailyStart,dailyEnd);

assert.equal((daily.match(/family-log-gear/g)||[]).length,1,'daily header must have exactly one settings gear');
for(const label of ['データをインポート','対象追加','表示設定','対象設定'])
  assert.ok(!daily.includes(label),`management action leaked into daily page: ${label}`);
assert.ok(!daily.includes('1ページ50件'),'technical page-size copy must stay out of the daily page');
assert.ok(daily.indexOf('family-log-quick-grid')>=0&&daily.indexOf('family-log-quick-grid')<daily.indexOf('${dashboardHtml}'),'quick record grid must precede dashboard');
assert.ok(daily.includes('<details class="card family-log-timer-card"'),'Family Log timer must remain collapsed details');
assert.ok(routes.includes("'/app/settings_family_log.php'"),'Family Log management route missing');
assert.ok(routes.includes("'/app/family_log_import.php'"),'Family Log import compatibility route missing');
assert.ok(app.includes('show_adult_logs')&&app.includes('settings_update'),'adult-log visibility setting/update markers missing');

console.log('family-log-daily-ux-contract: daily layout, management isolation, routes, timer, and adult visibility ok');
