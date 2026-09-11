import fs from 'node:fs';

const home=fs.readFileSync('src/home-page.ts','utf8');
const dashboard=fs.readFileSync('src/home-dashboard.ts','utf8');
const handlers=fs.readFileSync('src/auth-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

if(home.includes("from './app'"))throw new Error('home page must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { loadHomeDashboard } from './home-dashboard';",
  "export async function home(ctx:AppContext):Promise<Response>{",
  "redirect('/liff?next=%2Fapp%2Findex.php')",
  'FAMILY DASHBOARD',
  '要対応',
  '期限切れタスク',
  '期限切れ買い物',
  '今日の未完了タスク',
  '期限なし未整理',
  '昨日のAI日誌',
  '昨日の家族日誌',
  'href="/app/settings.php" aria-label="管理を開く"',
  'href="/app/family_journal.php"',
  'href="/app/location.php"',
  'href="/app/shopping.php"',
  'return=tasks',
  "return html(layout('ホーム',body,'/app/index.php'));",
])if(!home.includes(marker))throw new Error(`home dashboard marker missing: ${marker}`);
if(home.includes('明日:'))throw new Error('Home must prioritize today/yesterday instead of the old tomorrow menu summary');

for(const marker of [
  "import { recurringForDate } from './recurrence-projection';",
  "import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';",
  "export async function loadHomeDashboard(ctx:AppContext,today:string)",
  "taskVisibilitySql('t')",
  "taskChildVisibilitySql('s')",
  "t.status='pending'",
  "date(COALESCE(t.end_at,t.due_at,t.start_at))<date(?)",
  "date(COALESCE(s.due_date,t.end_at,t.due_at,t.start_at))<date(?)",
  "storage_tier='HOT'",
  'journal_date=?',
  'LIMIT 1',
  'd.sharing_enabled=1',
  'd.revoked_at IS NULL',
  'ai_location_member_ids_json',
  'required.every(id=>shared.has(id))',
  'return {...fallback,text:narrative,isAi:true}',
  'yesterdayJournal(ctx.env.DB,familyId,yesterday)',
])if(!dashboard.includes(marker))throw new Error(`home aggregation marker missing: ${marker}`);
if(/\blatitude\b|\blongitude\b/i.test(dashboard))throw new Error('Home dashboard must not query or render raw Location coordinates');
if(/LIKE\s+/i.test(dashboard))throw new Error('Home dashboard must not add historical free-text scans');
if(dashboard.includes('SELECT * FROM family_daily_journals'))throw new Error('Home dashboard journal lookup must stay column-bounded');

if(handlers.includes("from './app'"))throw new Error('auth page handlers must not depend on app.ts');
for(const marker of [
  "export { loginPage } from './login-page';",
  "export { createFamilyPage } from './family-onboarding-page';",
  "export { invitePage } from './family-invite-page';",
  "export { home } from './home-page';",
])if(!handlers.includes(marker))throw new Error(`retained auth page boundary missing: ${marker}`);
if(!routes.includes("if(url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php') return await home(context);"))throw new Error('home route changed');

console.log('home-page-boundary: bounded today/yesterday dashboard, action alerts, journal privacy gate and admin gear navigation ok');
