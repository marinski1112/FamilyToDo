# v12.35 → Cloudflare migration matrix

Source: `FamilyTODO_v12_35_full_latest.zip`

| Existing area | Cloudflare destination | Status |
|---|---|---|
| `app/bootstrap.php` session | encrypted Worker cookie session | foundation |
| `app/bootstrap.php` PDO | `src/db.ts` + D1 Binding API | foundation |
| `app/api/liff_login.php` | `/app/api/liff_login.php` | foundation, behavior not fully ported |
| `app/api/webhook.php` | `/app/api/webhook.php` | foundation, event handling not fully ported |
| `login.php` | Worker `/login.php` | placeholder |
| `today.php` | Worker route | implemented + unorganized tasks |
| `tomorrow.php` | Worker route | implemented + unorganized tasks |
| `app/calendar.php` | Worker route/API + static CSS | implemented, interaction polish ongoing |
| `app/recurrence.php` | Worker service module | pending |
| `task/*.php` | Worker routes | implemented, residual polish ongoing |
| `item/*.php` | Worker routes | pending |
| `app/shopping*.php` | Worker routes | implemented, residual polish ongoing |
| `app/message*.php` / `messages.php` | Worker routes | pending |
| `app/settings*.php` | Worker routes | pending |
| `family/*.php` | Worker routes | pending |
| `cron/notify.php` | Worker `scheduled()` | reserved, not enabled |
| `app/assets/family.css` | Workers Static Assets | copied |
| `app/assets/calendar.css` | Workers Static Assets | copied |
| `database/schema.sql` | existing MySQL schema | copied for reference |
| XREA ad script | Cloudflare-compatible alternative | pending decision |
| XREA `.fast-cgi-bin`, phpMyAdmin, logs | not migrated | intentionally excluded |

## Migration rule

Keep the XREA implementation intact until the Cloudflare version passes functional testing. Do not cut DNS or LINE webhook over early.
