# Wave98 — 12.117.0-wave98

## Storage policy and timezone
- Naive task and Family Log datetimes are formally family-local wall-clock values; Wave98 does not bulk-convert existing records.
- Every family has a validated IANA timezone (default `Asia/Tokyo`). Import values with offsets are projected into it; naive import values remain local wall-clock.
- Family AI groups stored local dates without a second `+9 hours`; Google Calendar outbound events carry the family timezone. Inbound sync remains Wave99.

## Safe legacy repair
- Administrators can preview and apply the Wave88–90 UTC-naive piyolog repair per completed batch. Edited/deleted rows are excluded.
- A unique audit record prevents double application and supports one safe rollback.

## Authorization and integrations
- `MANAGE_QUICK_CHORES` delegates only quick-chore item management to a MEMBER and grant/revoke is activity-audited.
- Calendar linking remains OAuth; application secrets and tokens are never exposed as family settings.
