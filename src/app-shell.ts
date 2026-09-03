import { APP_VERSION } from './version';

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const CALENDAR_STAMP_UI_REVISION = 'stamp-viewer-488';

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
  const extra=calendarExtra+familyLogExtra;
  // Every server-rendered native temporal control passes through one component.
  // Keeping padding/border on the shell avoids WebKit 301648's width:100% + padding bug.
  const compactBody=body.replace(/<input\b([^>]*\btype=["'](date|time|datetime-local)["'][^>]*)>/gi,(_all,attrs,type)=>`<span class="native-control-shell native-${type==='datetime-local'?'datetime':type}-shell"><input${attrs}></span>`);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="theme-color" content="#4f46e5"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><title>${esc(title)} - Family TODO LINE</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="icon" href="/assets/pwa-192.png"><link rel="stylesheet" href="/assets/family.css?v=${APP_VERSION}">${extra}</head><body><div class="wrap">${compactBody}</div>${nav}<script src="/assets/pwa.js?v=${APP_VERSION}"></script></body></html>`;
}
