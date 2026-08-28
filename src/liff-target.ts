export const RICH_MENU_DESTINATIONS = [
  '/app/tasks.php',
  '/app/calendar.php',
  '/app/shopping.php',
  '/app/family_log.php',
  '/app/messages.php',
  '/app/settings.php',
] as const;

export const LIFF_PATH_ALIASES: Readonly<Record<string, string>> = {
  tasks: '/app/tasks.php', calendar: '/app/calendar.php', shopping: '/app/shopping.php',
  'family-log': '/app/family_log.php', messages: '/app/messages.php', settings: '/app/settings.php',
};

const INTERNAL_PATH = /^\/(?!\/)[^\r\n\\]*$/;
const GOOGLE_CONTINUE = /^\/oauth\/google\/continue\?resume=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Validate a post-LIFF destination. OAuth endpoints are denied by default. */
export function validateLiffNext(value: unknown): string | null {
  const path = typeof value === 'string' ? value : '';
  if (!path || path.length > 2048 || !INTERNAL_PATH.test(path)) return null;
  if (path.startsWith('/oauth/')) return GOOGLE_CONTINUE.test(path) ? path : null;
  return path;
}

export function googleContinuePath(token: string): string | null {
  const path = `/oauth/google/continue?resume=${encodeURIComponent(token)}`;
  return validateLiffNext(path);
}

/** Resolve LINE additional-path and primary-redirect forms without recursive decoding. */
export function resolveLiffDestination(url: URL): string {
  const alias = url.pathname.match(/^\/liff\/([^/]+)\/?$/)?.[1];
  if (alias && LIFF_PATH_ALIASES[alias]) return LIFF_PATH_ALIASES[alias];
  const explicit = validateLiffNext(url.searchParams.get('next'));
  if (explicit) return explicit;
  const state = url.searchParams.get('liff.state');
  if (state && state.length <= 2048) {
    const stateAlias = state.match(/^\/([^/?#]+)\/?$/)?.[1];
    if (stateAlias && LIFF_PATH_ALIASES[stateAlias]) return LIFF_PATH_ALIASES[stateAlias];
    if (state.startsWith('?')) {
      const fromState = validateLiffNext(new URLSearchParams(state.slice(1)).get('next'));
      if (fromState) return fromState;
    }
  }
  return '/app/index.php';
}

export function liffTargetKind(path: string): string {
  return Object.entries(LIFF_PATH_ALIASES).find(([, value]) => value === path)?.[0].replace('-', '_')
    || (path === '/app/index.php' ? 'home' : 'other');
}
