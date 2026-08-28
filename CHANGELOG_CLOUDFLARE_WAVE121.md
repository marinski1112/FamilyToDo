# Cloudflare Wave121 — 12.140.0-wave121

- Split LINE Login Web OAuth credentials from Messaging API credentials and added bounded upstream error categories.
- Preserved unauthenticated HTML destinations while returning JSON 401 responses for API authentication failures.
- Added `/liff/<alias>`, bounded `liff.state` resolution, and post-cookie session confirmation without a silent home fallback.
- Replaced Family Log quick-action prompts with a Japanese form editor and mobile-friendly up/down ordering.
- No migration was added; Wave120 migration `0040_wave120_family_log_quick_actions.sql` remains unchanged.
