# v12.35 Cloudflare D1 migration progress

## Wave 1 — functional core
- Cloudflare Worker routing and D1 binding
- encrypted cookie session and CSRF token
- LINE LIFF ID-token verification + existing-member lookup
- family create / join
- top page
- 今日 / 明日の準備
- task creation + task detail + task edit/delete
- item creation + item edit/delete
- task/item/shopping completion toggles
- compatibility endpoint `/app/api/check.php`
- task reorder endpoint `/app/api/reorder.php`
- calendar month view with 6-week grid, day selection, detail, task/event creation entry points
- event creation
- messages list/post
- shopping list/add/toggle + shopping edit/delete
- basic settings: profile, member suspend/reopen/delete, notification settings
- D1 initial schema + v12.35 compatibility migration

## Wave 5 — recurring task management
- recurring task edit flow
- recurring task deletion flow
- monthly week-number and business-day fields wired to D1
- recurring task template fields: description, location, time, all-day, calendar visibility, completion mode
- recurring POST session/CSRF persistence hardened

## Wave 7 — consolidated legacy-route and family-operation migration
- invitation-token join flow fixed and connected to D1 `family_invitations`
- legacy route aliases added for message/shopping/settings subpages
- task deletion compatibility endpoint added
- recurring occurrence conversion endpoint added
- admin activity-log page added
- logout compatibility route added

## Still pending
- exact visual parity with every v12.35 PHP screen
- full recurring-task creation/edit/occurrence generation parity
- full shopping/category/group behavior
- LINE Webhook event business logic and push notifications
- diagnostics/reorder UX parity
- XREA bottom-ad behavior replacement for Cloudflare
- comprehensive end-to-end testing with real data

## Migration safety rule
The original XREA/PHP implementation remains the reference implementation and is not modified by this migration work. DNS and LINE Webhook are intentionally not cut over until the Cloudflare version passes functional testing.

## Wave 3 — automation and family operations
- invitation token generation + /family/join.php token flow
- recurring task management UI backed by recurrence_rules
- LINE webhook signature verification and basic text replies
- webhook activity logging into activity_logs
- scheduled notification dispatcher via LINE Push API
- 15-minute Cron Trigger configured (execution remains disabled while NOTIFY_MODE=manual)
- D1 performance indexes for recurring/invitation/notification queries


## Wave 9 — 全ページ一括移植ベース
- v12.35の元UIを基準に全主要ページの導線・カードUIを統一
- 今日/明日、カレンダー、買い物、伝言、管理、メンバー、通知、投稿管理、定期タスクを一通り接続
- カレンダー専用CSSを実際のWorkerページへ読み込むよう修正
- D1 migration追加なし
- TypeScript typecheck 成功

## Wave29
- 通知設定保存フローをJSON化し、複数メンバー選択を正常化。
- タスク編集時の旧未送信通知を削除してから再生成。
- 伝言の編集・削除、通知日時変更、旧通知削除を追加。
- 伝言一覧へ通知日時表示を追加。
- CSS cache version 12.51-wave29.


## Wave40 residual hardening
- Japanese monthly business-day recurrence now excludes Japanese holidays, matching the XREA recurrence implementation.
- Legacy `/app/create.php`, `/app/join.php`, `/login_error.php`, and LIFF diagnostic routes are retained as Cloudflare compatibility aliases.
- Family creation now uses D1 `run().meta.last_row_id` instead of a follow-up `last_insert_rowid()` statement.

## Wave52 legacy-event FK cleanup
- Added `0015_wave52_remove_legacy_event_fk.sql`.
- Removes stale `event_id` columns / `REFERENCES events(id)` constraints left after Wave33.
- Preserves task/item/shopping/message/recurrence IDs and direct assignee/history rows.
- Application remains task-only; LINE Webhook `events[]` is unchanged.

## Wave62
- Calendar day-detail mobile reorder restored via ↑/↓ controls and hardened reorder API.
- Recurrence occurrence -> normal task conversion fixed for HTML form POST, D1 binding count, assignee/completion preservation and linked shopping/item cloning.
- Removed invalid Worker references to non-existent `shopping_items.group_key`.
- Message edit moved from prompt() to mobile sheet.
- Invitation history/status/revoke added.
- No D1 migration added; latest remains 0015.


## Wave63
- Calendar silent-JS regression fixed.
- Calendar browser controller externalized to `public/assets/calendar.js` and syntax-checkable independently.
- No DB migration. Latest remains `0015_wave52_remove_legacy_event_fk.sql`.

## Wave66
- No new D1 migration.
- Added recurrence exception delete lifecycle, future-only series split, recurring child preservation, and notification lifecycle audit.

## Wave67
- No new D1 migration.
- Per-date calendar band reservation, hidden recurring day-detail visibility, excluded occurrence restore UI, split-series lineage, recurring controller externalization, and expanded lifecycle/orphan audit.


## Wave69
- No new D1 migration.
- Shopping URL popover/no-focus row addition, shopping/notification static JS extraction, and read-only lifecycle diagnostics page.

## Wave70
- No new D1 migration.
- Added task-kind EVENT semantics without restoring legacy events tables.
- Added shared lifecycle archive helpers and read-only diagnostic detail samples.
- Externalized task create/edit browser JavaScript.


## Wave71
- No D1 migration.
- Externalized Today/Tomorrow, task-detail, and shopping-list browser controllers; expanded delete/archive helper usage; aligned Event home counters.

## Wave72
- No new D1 migration.
- LIFF/login, family onboarding and item-create browser controllers moved to static JS assets.
- Shared recurrence occurrence archive/delete lifecycle helpers added and adopted by destructive paths.
- Future sequence recorded: unified Tasks page -> six-menu switch -> Family Log MVP -> PWA/Web Push -> Google Tasks/Gemini ingress.


## Wave73
- Added unified `/app/tasks.php` Task/Event daily view and changed primary navigation from separate Today/Tomorrow to Task/Event.
- Legacy `/today.php` and `/tomorrow.php` remain compatibility routes.
- No new D1 migration; latest remains 0015.


## Wave74
- Added migration `0016_wave74_web_push.sql`.
- Adds `members.notification_channel` and `web_push_subscriptions`.
- Adds PWA manifest/service worker and Web Push subscription/test/scheduled-delivery foundation.
- Existing members default to LINE delivery until they explicitly enable Web Push.


## Wave75
- Added Family Log MVP as the sixth primary page.
- Added migration `0017_wave75_family_log.sql` for subjects, chronological logs, and timers.
- Family logs can optionally link to physical tasks/events or recurring occurrence rows.
- LIFF/rich-menu device validation is ready after deployment and migrations.
