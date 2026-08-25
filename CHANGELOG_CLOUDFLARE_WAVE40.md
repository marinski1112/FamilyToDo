# Family TODO LINE Cloudflare Wave40

- Recurrence parity: MONTHLY_BUSINESS_DAY excludes Japanese holidays, matching the XREA implementation.
- Compatibility routes: `/app/create.php`, `/app/join.php`, `/login_error.php`, and `/app/api/liff_config_diagnose.php`.
- D1 family creation now obtains the inserted family ID directly from `meta.last_row_id`.
- Event concept remains removed; all calendar entries are tasks/recurring tasks.
