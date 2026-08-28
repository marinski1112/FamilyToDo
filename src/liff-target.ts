export const RICH_MENU_DESTINATIONS = [
  '/app/tasks.php',
  '/app/calendar.php',
  '/app/shopping.php',
  '/app/family_log.php',
  '/app/messages.php',
  '/app/settings.php',
] as const;

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
