import fs from 'node:fs';

const page=fs.readFileSync('src/settings-members-page.ts','utf8');
const handlers=fs.readFileSync('src/settings-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { html, redirect } from './response';",
  "import { APP_VERSION } from './version';",
  'export async function settingsMembers(_request:Request,ctx:AppContext):Promise<Response>{',
  "redirect('/login.php?next=%2Fapp%2Fsettings_members.php')",
  "role!=='OWNER'&&role!=='ADMIN'",
  "new Response('管理者権限が必要です。',{status:403})",
  "permission_key='MANAGE_QUICK_CHORES'",
  'FROM family_invitations i LEFT JOIN members c ON c.id=i.created_by',
  'ORDER BY i.id DESC LIMIT 20',
  "const status=used?'使用済み':active?'有効':'期限切れ/取消済み'",
  'class="quick-chore-permission"',
  'class="btn gray small member-toggle"',
  'class="btn danger small member-del"',
  'class="btn danger small invite-revoke"',
  'id="invite"',
  'id="settingsMembersPayload"',
  "JSON.stringify({csrf:ctx.session.csrfToken||''})",
  '/assets/settings-members.js?v=${APP_VERSION}',
  "layout('家族メンバー',body,'/app/settings.php')",
]) if(!page.includes(marker)) throw new Error(`settings members page lost behavior marker: ${marker}`);
if(page.includes("from './app'")) throw new Error('settings members page must not depend on app.ts');

if(!handlers.includes("export { settingsMembers } from './settings-members-page';")) throw new Error('settings page handlers must export retained settingsMembers');
if(!handlers.includes("export { settings } from './settings-root';")) throw new Error('top-level settings retained boundary regressed');
if(handlers.includes("from './app'")) throw new Error('settings page handlers must not depend on app.ts after recurring extraction');
if(!handlers.includes("export { recurring } from './recurring-page';")) throw new Error('recurring retained boundary missing');

if(!routes.includes("if(url.pathname==='/app/settings_members.php') return await settingsMembers(request,context);")) throw new Error('settings-members route wiring changed');

console.log('settings members retained page boundary contract ok');
