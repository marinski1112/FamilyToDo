import { APP_VERSION } from './version';

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const CALENDAR_STAMP_UI_REVISION = 'stamp-multi-placement-2';
const TASK_CHILD_UI_REVISION = 'child-task1';
const FAMILY_LOG_UI_REVISION = 'baby-food-photo1';
const LOCATION_UI_REVISION = 'maps-callback1';

const BOTTOM_NAV_VIEWPORT_FIX = `<style data-bottom-nav-viewport-fix="1">
:root{--nav-safe-top:env(safe-area-inset-top,0px);--nav-safe-bottom:env(safe-area-inset-bottom,0px);--nav-safe-left:env(safe-area-inset-left,0px);--nav-safe-right:env(safe-area-inset-right,0px);--nav-box-h:calc(var(--nav-h) + var(--nav-safe-bottom))}
body{padding-bottom:0}
.wrap{padding-top:calc(18px + var(--nav-safe-top))!important;padding-left:var(--nav-safe-left)!important;padding-right:var(--nav-safe-right)!important;padding-bottom:calc(var(--nav-box-h) + 30px)!important}
.bottom-nav{height:var(--nav-box-h)!important;min-height:var(--nav-box-h)!important;padding-left:calc(8px + var(--nav-safe-left))!important;padding-right:calc(8px + var(--nav-safe-right))!important;padding-bottom:calc(7px + var(--nav-safe-bottom))!important;transform:none!important;-webkit-transform:none!important;will-change:auto!important}
.fab{right:calc(16px + var(--nav-safe-right))!important;bottom:calc(var(--nav-box-h) + 14px)!important}
</style>`;

/**
 * Canonical shell for retained server-rendered pages.
 *
 * Keep navigation order, Calendar stylesheet loading, native temporal-control
 * wrapping, and asset versioning behavior-compatible with the legacy app.ts
 * implementation while the monolith is decomposed incrementally.
 */
export function layout(title: string, body: string, active = ''): string {
  const navItems = [
    ['/app/tasks.php','✅','チェックリスト'],
    ['/app/calendar.php','📅','カレンダー'],
    ['/app/location.php','📍','位置情報'],
    ['/app/family_log.php','🐣','家族ログ'],
    ['/app/messages.php','💬','伝言'],
    ['/app/settings.php','⚙️','管理'],
  ];
  const nav = `<nav class="bottom-nav"><div class="nav-inner" style="--nav-count:${navItems.length}">${navItems.map(([href,icon,label])=>`<a class="${active===href?'active':''}" href="${href}"><span>${icon}</span>${label}</a>`).join('')}</div></nav>`;
  const calendarExtra=active==='/app/calendar.php'?`<link rel="stylesheet" href="/assets/calendar.css?v=${APP_VERSION}"><script defer src="/assets/calendar-stamp-ui.js?v=${APP_VERSION}-${CALENDAR_STAMP_UI_REVISION}"></script>`:'';
  const familyLogExtra=active==='/app/family_log.php'?`<link rel="stylesheet" href="/assets/family-log-layout.css?v=${APP_VERSION}">`:'';
  const locationDiagnosticsExtra=active==='/app/location.php'?`<script defer src="/assets/location-maps-diagnostics.js?v=${APP_VERSION}-maps-diagnostics3"></script>`:'';
  const locationExtra=active==='/app/location.php'?`<script defer src="/assets/location.js?v=${APP_VERSION}-${LOCATION_UI_REVISION}"></script>`:'';
  const extra=calendarExtra+familyLogExtra+locationDiagnosticsExtra+locationExtra;
  // Every server-rendered native temporal control passes through one component.
  // Keeping padding/border on the shell avoids WebKit 301648's width:100% + padding bug.
  const compactBody=body.replace(/<input\b([^>]*\btype=["'](date|time|datetime-local)["'][^>]*)>/gi,(_all,attrs,type)=>`<span class="native-control-shell native-${type==='datetime-local'?'datetime':type}-shell"><input${attrs}></span>`)
    .replace(/\/assets\/task-edit\.js\?v=[^"'<>\s]+/g,`/assets/task-edit.js?v=${APP_VERSION}-${TASK_CHILD_UI_REVISION}`)
    .replace(/\/assets\/task-view\.js\?v=[^"'<>\s]+/g,`/assets/task-view.js?v=${APP_VERSION}-${TASK_CHILD_UI_REVISION}`)
    .replace(/\/assets\/family-log\.js\?v=[^"'<>\s]+/g,`/assets/family-log.js?v=${APP_VERSION}-${FAMILY_LOG_UI_REVISION}`);
  const roughInputExtra=compactBody.includes('id="taskNewPayload"')?`<script src="/assets/task-rough-input-ai.js?v=${APP_VERSION}-explicit-save1"></script><script src="/assets/task-rough-input-save.js?v=${APP_VERSION}-explicit-save1"></script>`:'';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light"><meta name="theme-color" content="#4f46e5"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><title>${esc(title)} - Family TODO LINE</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="icon" href="/assets/pwa-192.png"><link rel="stylesheet" href="/assets/family.css?v=${APP_VERSION}">${extra}${BOTTOM_NAV_VIEWPORT_FIX}</head><body><div class="wrap">${compactBody}</div>${nav}<script src="/assets/pwa.js?v=${APP_VERSION}"></script>${roughInputExtra}</body></html>`;
}
