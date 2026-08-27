# Wave73 residual analysis

## Production QA
1. Home menu shows one **タスク・イベント** card instead of separate Today/Tomorrow cards.
2. Bottom navigation has five entries and Task/Event is active on `/app/tasks.php`.
3. `/app/tasks.php` opens today by default.
4. Today and Tomorrow quick chips switch dates.
5. Previous/next arrows move one day.
6. Normal task completion still works.
7. Recurring occurrence completion still works.
8. EVENT appears but has no completion checkbox.
9. Linked shopping/item toggles still work.
10. Expired task modal still works and EVENT is excluded.
11. Create normal task from Task/Event page -> returns to same date.
12. Create EVENT -> returns to same date.
13. Calendar-origin create still returns to calendar.
14. Legacy `/today.php` and `/tomorrow.php` URLs still render.

## Intentional transitional state
- Primary navigation is five items until the family-log page is ready.
- Do not remove `/today.php` or `/tomorrow.php` yet; retain them for old links/LIFF compatibility.
- Family log is not implemented in Wave73 and no LIFF menu change is requested yet.

## Next planned sequence
1. Stabilize the unified Task/Event page on device.
2. Add PWA manifest/service-worker foundation.
3. Add Web Push subscription storage and notification delivery path.
4. Build family-log MVP as the sixth primary menu page.
5. When family-log save/view flows are ready for device QA, explicitly ask the user to update LIFF/rich-menu navigation for testing.
6. Later add Google Tasks / Gemini voice ingress after the app-side APIs are stable.

## Technical debt
- The detailed daily renderer still serves both compatibility Today/Tomorrow pages and the new unified page. Keep this shared path until production behavior is proven stable.
- EVENT semantics still need continuing audit across every aggregate/report/search introduced later.
- Continue destructive lifecycle/archive commonization and static browser-script extraction.
