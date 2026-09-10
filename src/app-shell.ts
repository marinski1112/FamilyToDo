import { APP_VERSION } from './version';

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const CALENDAR_STAMP_UI_REVISION = 'stamp-multi-placement-2';
const TASK_CHILD_UI_REVISION = 'child-task1-linked2';
const TASK_ENTRY_UI_REVISION = 'ai-first-ui1-message4';
const FAMILY_LOG_UI_REVISION = 'baby-food-photo2-observer1-form2';
const LOCATION_UI_REVISION = 'maps-family-markers1-sheet4';

const BOTTOM_NAV_VIEWPORT_FIX = `<style data-bottom-nav-viewport-fix="1">
:root{--nav-safe-top:env(safe-area-inset-top,0px);--nav-safe-bottom:env(safe-area-inset-bottom,0px);--nav-safe-left:env(safe-area-inset-left,0px);--nav-safe-right:env(safe-area-inset-right,0px);--nav-box-h:calc(var(--nav-h) + var(--nav-safe-bottom))}
body{padding-bottom:0}
.wrap{padding-top:calc(18px + var(--nav-safe-top))!important;padding-left:var(--nav-safe-left)!important;padding-right:var(--nav-safe-right)!important;padding-bottom:calc(var(--nav-box-h) + 30px)!important}
.bottom-nav{height:var(--nav-box-h)!important;min-height:var(--nav-box-h)!important;padding-left:calc(8px + var(--nav-safe-left))!important;padding-right:calc(8px + var(--nav-safe-right))!important;padding-bottom:calc(7px + var(--nav-safe-bottom))!important;transform:none!important;-webkit-transform:none!important;will-change:auto!important}
.fab{right:calc(16px + var(--nav-safe-right))!important;bottom:calc(var(--nav-box-h) + 14px)!important}
</style>`;

export function layout(title: string, body: string, active = ''): string {
  const navItems = [
    ['/app/tasks.php','✅','チェックリスト'],
    ['/app/calendar.php','📅','カレンダー'],
    ['/app/location.php','📍','位置情報'],
    ['/app/family_log.php','🐣','家族ログ'],
    ['/app/messages.php','💬','伝言'],
    ['/app/settings.php','⚙️','管理'],
  ];
  const nav = `<nav class="bottom-nav" aria-label="メインメニュー"><div class="nav-inner" style="--nav-count:${navItems.length}">${navItems.map(([href,icon,label])=>`<a class="${active===href?'active':''}" href="${href}"${active===href?' aria-current="page"':''}><span aria-hidden="true">${icon}</span>${label}</a>`).join('')}</div></nav>`;
  const calendarExtra=active==='/app/calendar.php'?`<link rel="stylesheet" href="/assets/calendar.css?v=${APP_VERSION}"><script defer src="/assets/calendar-stamp-ui.js?v=${APP_VERSION}-${CALENDAR_STAMP_UI_REVISION}"></script>`:'';
  const familyLogExtra=active==='/app/family_log.php'?`<link rel="stylesheet" href="/assets/family-log-layout.css?v=${APP_VERSION}-mobile1"><script defer src="/assets/family-log-success-recovery.js?v=${APP_VERSION}-post-save1"></script><script defer src="/assets/family-journal-link.js?v=${APP_VERSION}-journal1"></script>`:'';
  const locationDiagnosticsExtra=active==='/app/location.php'?`<script defer src="/assets/location-maps-diagnostics.js?v=${APP_VERSION}-maps-diagnostics4"></script>`:'';
  const locationExtra=active==='/app/location.php'?`<script defer src="/assets/location.js?v=${APP_VERSION}-${LOCATION_UI_REVISION}"></script><script defer src="/assets/location-retention-copy.js?v=${APP_VERSION}-raw-maintenance1"></script>`:'';
  const messageExtra=active==='/app/messages.php'?`<link rel="stylesheet" href="/assets/messages-compact.css?v=message3"><script defer src="/assets/messages-ai-ui.js?v=message3"></script>`:'';
  const extra=calendarExtra+familyLogExtra+locationDiagnosticsExtra+locationExtra+messageExtra;
  const compactBody=body.replace(/<input\b([^>]*\btype=["'](date|time|datetime-local)["'][^>]*)>/gi,(_all,attrs,type)=>`<span class="native-control-shell native-${type==='datetime-local'?'datetime':type}-shell"><input${attrs}></span>`)
    .replace(/\/assets\/messages\.js\?v=[^"'<>\s]+/g,`/assets/messages.js?v=${APP_VERSION}-message3`)
    .replace(/\/assets\/location-history-ui\.js\?v=[^"'<>\s]+/g,`/assets/location-history-ui.js?v=${APP_VERSION}-history9`)
    .replace(/\/assets\/task-new\.js\?v=[^"'<>\s]+/g,`/assets/task-new.js?v=${APP_VERSION}-${TASK_ENTRY_UI_REVISION}`)
    .replace(/\/assets\/task-edit\.js\?v=[^"'<>\s]+/g,`/assets/task-edit.js?v=${APP_VERSION}-${TASK_CHILD_UI_REVISION}`)
    .replace(/\/assets\/task-view\.js\?v=[^"'<>\s]+/g,`/assets/task-view.js?v=${APP_VERSION}-${TASK_CHILD_UI_REVISION}`)
    .replace(/\/assets\/family-log\.js\?v=[^"'<>\s]+/g,`/assets/family-log.js?v=${APP_VERSION}-${FAMILY_LOG_UI_REVISION}`)
    .replace(/\/assets\/family-log-diagnostics\.js\?v=[^"'<>\s]+/g,`/assets/family-log-diagnostics.js?v=${APP_VERSION}-quick-client-persist1`);
  const linkedEntryExtra=compactBody.includes('id="taskForm"')||compactBody.includes('id="taskEditForm"')?'<link rel="stylesheet" href="/assets/task-linked-items.css?v=linked2"><script defer src="/assets/task-linked-items-ui.js?v=linked2"></script>':'';
  const roughInputExtra=compactBody.includes('id="taskNewPayload"')?`<script src="/assets/task-rough-input-ai.js?v=${APP_VERSION}-explicit-save1-${TASK_ENTRY_UI_REVISION}"></script><script src="/assets/task-rough-input-save.js?v=${APP_VERSION}-explicit-save1-${TASK_ENTRY_UI_REVISION}"></script><script src="/assets/task-rough-input-shopping-manual.js?v=${APP_VERSION}-shopping-manual1-${TASK_ENTRY_UI_REVISION}"></script><script src="/assets/task-rough-input-item-manual.js?v=${APP_VERSION}-item-manual1-${TASK_ENTRY_UI_REVISION}"></script>`:'';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light"><meta name="theme-color" content="#4f46e5"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><title>${esc(title)} - Family TODO LINE</title><link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"><link rel="apple-touch-icon" sizes="180x180" href="/app-icon-180.png"><link rel="icon" href="/app-icon-192.png"><link rel="stylesheet" href="/assets/family.css?v=${APP_VERSION}-${TASK_ENTRY_UI_REVISION}">${extra}${linkedEntryExtra}${BOTTOM_NAV_VIEWPORT_FIX}</head><body><div class="wrap" role="main">${compactBody}</div>${nav}<script src="/assets/pwa.js?v=${APP_VERSION}-quick-owner1"></script>${roughInputExtra}</body></html>`;
}
