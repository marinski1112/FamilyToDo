# Wave56 residual analysis

## Root cause confirmed for calendar 500

Cloudflare reported:
`D1_ERROR: Wrong number of parameter bindings for SQL query.`
from `recurringForDate()`.

The completion-count SQL had two placeholders:
1. `c.occurrence_id=?`
2. nested `recurrence_occurrences WHERE id=?`

but the source supplied only one bind argument. This remains dormant until a recurring occurrence is rendered, which explains why calendar began failing immediately after recurring-task creation.

## Recurring delete

Wave55 used JS-only `fetch()` handlers for delete/toggle. In LINE WebView, any client-side interruption can make the button appear to do nothing. Wave56 renders actual HTML POST forms and uses JS only as progressive enhancement. This also improves failure observability.

## Remaining priorities

- Verify existing recurring occurrences and exception-task lifecycle after edit/delete.
- Continue SQL placeholder/bind-count audit across all non-trivial queries.
- Add explicit Worker-side request logging for recurring delete/update/toggle failures if further field reports appear.
- Continue calendar multi-day layout and recurrence exception behavior.
- Continue message/shopping/task compact mobile UI review.
- Continue invitation expiry/revoke and notification lifecycle audit.
