# Wave76 residual analysis

## Root cause confirmed
`/app/family_log.php` GET failed in the timer query:

```sql
SELECT x.*, s.name subject_name
FROM family_log_timers x
LEFT JOIN family_log_subjects s ON s.id=x.subject_id
WHERE family_id=? AND status='running'
ORDER BY x.started_at_ms
```

`family_log_subjects` and `family_log_timers` both expose `family_id`, so the predicate is ambiguous after the JOIN.

Wave76 uses:
```sql
WHERE x.family_id=? AND x.status='running'
```

and when a subject filter is active:
```sql
WHERE x.family_id=? AND x.status='running' AND x.subject_id=?
```

## Production checks
1. Open `/app/family_log.php`.
2. Confirm the page renders with zero subjects/logs/timers.
3. Add a subject.
4. Record a memo or milk entry.
5. Start/stop Sleep timer.
6. Filter by a subject and confirm the filtered page renders.
7. Open `/__cf/db-runtime-health`; `family_log_page_timer_join` should be `ok:true`.

## Remaining Family Log priorities
- subject edit/disable
- breastfeeding left/right timer separation
- medicine name/dose structure
- weekly/monthly charts
- stronger recurring-task -> log workflow
- Web Push device diagnostics and delivery hardening

## Migration
No new migration in Wave76.
