# Wave68 residual analysis

## Production checks
1. In a week where a multi-day band exists only on some dates, a normal task on a date not crossed by the band should start immediately below the date number.
2. Dates crossed by a band should reserve only their own required band rows.
3. Date tap / day swipe / month swipe / reorder must remain working.
4. Messages: create/edit/delete, convert to task, convert to shopping.
5. Settings/members: profile save, member stop/restart/delete, invite create/share/revoke.
6. Check Cloudflare Live for lifecycle audit warnings after Cron.

## Archive interpretation
`deleted_completion_history` intentionally has no foreign keys so history survives live-row deletion. A missing live task/item/shopping row is therefore not an archive orphan by itself. Duplicate archive groups and member-family mismatch are audited instead.

## Remaining priorities
- Externalize notification/settings-content and other large interactive scripts.
- Add an admin lifecycle diagnostics page summarizing orphan/duplicate counts instead of relying only on Worker logs.
- Continue recurrence series lineage and excluded-date management UX.
- Consolidate calendar CSS only after current positioning remains stable in production.
- Review direct delete paths against one canonical archival helper to reduce future divergence.
