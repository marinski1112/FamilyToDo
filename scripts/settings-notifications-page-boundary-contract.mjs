import fs from 'node:fs';

const page=fs.readFileSync('src/settings-notifications-page.ts','utf8');
const handlers=fs.readFileSync('src/settings-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { html, json, redirect } from './response';",
  "import { APP_VERSION } from './version';",
  "import { webPushConfigured, webPushPublicKey } from './webpush';",
  'export async function settingsNotifications(request:Request,ctx:AppContext):Promise<Response>{',
  "request.method==='POST'",
  'saveNotificationSettings(request,ctx,isAdmin)',
  "receivedCsrf!==expectedCsrf",
  "UPDATE members SET notification_enabled=0 WHERE family_id=? AND deleted_at IS NULL",
  "UPDATE members SET notification_enabled=1 WHERE family_id=? AND id=? AND deleted_at IS NULL",
  "UPDATE members SET notification_enabled=? WHERE family_id=? AND id=? AND deleted_at IS NULL",
  "UPDATE members SET notification_channel=? WHERE family_id=? AND id=? AND deleted_at IS NULL",
  'INSERT INTO line_daily_digest_settings',
  'ON CONFLICT(family_id) DO UPDATE SET enabled=excluded.enabled',
  'UPDATE line_daily_digest_recipients SET enabled=0,updated_at=? WHERE family_id=?',
  'INSERT INTO line_daily_digest_recipients',
  'ON CONFLICT(family_id,member_id) DO UPDATE SET enabled=1',
  "redirect('/login.php?next=%2Fapp%2Fsettings_notifications.php')",
  "COALESCE(notification_channel,'LINE') notification_channel",
  'FROM line_daily_digest_settings WHERE family_id=?',
  'FROM line_daily_digest_recipients WHERE family_id=? AND enabled=1',
  'FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1',
  'SELECT id,user_agent,enabled,last_success_at,failure_count,last_error,updated_at FROM web_push_subscriptions',
  "return 'iPhone / Safari PWA'",
  "return 'Android / Chrome'",
  'webPushConfigured(ctx.env)',
  'webPushPublicKey(ctx.env)',
  'name="notification_channel" value="WEB_PUSH"',
  'LINEへのfallbackは行いません。',
  'name="digest_enabled"',
  'name="digest_time"',
  'name="digest_members"',
  'id="pushEnable"',
  'id="pushTest"',
  'id="pushDisable"',
  'id="notificationSettingsPayload"',
  '/assets/settings-notifications.js?v=${APP_VERSION}',
  "layout('通知設定',body,'/app/settings.php')",
]) if(!page.includes(marker)) throw new Error(`settings notifications page lost behavior marker: ${marker}`);
if(page.includes("from './app'")) throw new Error('settings notifications page must not depend on app.ts');

if(!handlers.includes("export { settingsNotifications } from './settings-notifications-page';")) throw new Error('settings page handlers must export retained settingsNotifications');
if(!handlers.includes("export { settings } from './settings-root';")) throw new Error('top-level settings retained boundary regressed');
if(handlers.includes("from './app'")) throw new Error('settings page handlers must not depend on app.ts after recurring extraction');
if(!handlers.includes("export { recurring } from './recurring-page';")) throw new Error('recurring retained boundary missing');
for(const retained of [
  "export { settingsContent } from './settings-content-page';",
  "export { settingsMembers } from './settings-members-page';",
  "export { settingsDiagnostics } from './settings-diagnostics';",
]) if(!handlers.includes(retained)) throw new Error(`prior retained settings boundary regressed: ${retained}`);

if(!routes.includes("if(url.pathname==='/app/settings_notifications.php') return await settingsNotifications(request,context);")) throw new Error('settings-notifications route wiring changed');

console.log('settings notifications retained page boundary contract ok');
