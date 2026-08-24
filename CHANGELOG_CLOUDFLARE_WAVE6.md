# Family TODO LINE Cloudflare migration — Wave 6

## LIFF direct test path

- Added `/liff` as a dedicated LIFF Endpoint URL.
- LIFF initializes, performs LINE login when needed, obtains the ID token, posts it to `/app/api/liff_login.php`, persists the Worker session cookie, and redirects to `/app/index.php` (or a safe same-origin `next` path).
- Added `/__cf/auth-health` to inspect authentication state without exposing token/cookie values.
- Added mobile safe-area CSS for the LINE in-app browser.

## Important

- This wave is based on the existing Wave 5 working tree in `/mnt/data/current`; no unrelated source was recreated.
- D1 schema and existing Cloudflare secrets are unchanged.
- DNS and LINE webhook cutover remain disabled.
