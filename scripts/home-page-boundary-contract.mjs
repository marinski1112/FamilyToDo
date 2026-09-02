import fs from 'node:fs';

const home=fs.readFileSync('src/home-page.ts','utf8');
const handlers=fs.readFileSync('src/auth-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

if(home.includes("from './app'"))throw new Error('home page must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { recurringForDate } from './recurrence-projection';",
  "import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';",
  "export async function home(ctx:AppContext):Promise<Response>{",
  "redirect('/liff?next=%2Fapp%2Findex.php')",
  "SELECT * FROM families WHERE id=? LIMIT 1",
  "taskVisibilitySql('t')",
  "NOT IN ('recurring','recurrence_template')",
  'recurringForDate(ctx,today)',
  'recurringForDate(ctx,tomorrowDate)',
  "taskChildVisibilitySql('s')",
  'SELECT count(*) c FROM messages WHERE family_id=?',
  'deleted_at IS NULL AND date(occurred_at)=date(?)',
  "String(r.status||'pending')==='pending'",
  "href=\"/app/tasks.php\"",
  "href=\"/app/calendar.php\"",
  "href=\"/app/shopping.php\"",
  "href=\"/app/family_log.php\"",
  "href=\"/app/messages.php\"",
  "href=\"/app/settings.php\"",
  'return=tasks',
  "return html(layout('Family TODO LINE',body,'/app/index.php'));",
])if(!home.includes(marker))throw new Error(`retained home behavior marker missing: ${marker}`);

if(handlers.includes("from './app'"))throw new Error('auth page handlers must not depend on app.ts');
for(const marker of [
  "export { loginPage } from './login-page';",
  "export { createFamilyPage } from './family-onboarding-page';",
  "export { invitePage } from './family-invite-page';",
  "export { home } from './home-page';",
])if(!handlers.includes(marker))throw new Error(`retained auth page boundary missing: ${marker}`);
if(!routes.includes("if(url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php') return await home(context);"))throw new Error('home route changed');

console.log('home-page-boundary: retained dashboard counts, privacy, recurrence and navigation ok');
