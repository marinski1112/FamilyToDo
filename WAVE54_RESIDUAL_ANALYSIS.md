# Wave54 residual analysis

## Fixed / reduced in this wave

1. Invitation flow no longer requires the administrator to manually discover and paste the Official Account friend-add URL. Bot info is fetched from LINE using the already configured channel access token.
2. The family join page contained malformed inline JavaScript at the end of its submit handler; fixed.
3. Recurring-task child shopping/item buttons existed in HTML but had no JavaScript handlers; fixed.
4. Recurring-task submission now has explicit mobile-safe field access, validation, disabled-state feedback and network error handling. This directly targets the reported symptom where tapping the create button appeared to do nothing.
5. Message-to-task conversion is no longer a prompt-only new-task flow. It can attach to an existing task or create a fully configured task.

## Still to verify on device

- Recurring task creation for DAILY, WEEKLY, MONTHLY_DAY, MONTHLY_WEEKDAY and MONTHLY_BUSINESS_DAY.
- Appearance of generated occurrences on Today/Tomorrow/Calendar and completion state per occurrence.
- Existing-task message attachment and description append behavior.
- New-task message conversion with all-day and timed tasks.
- LINE Official Account auto-discovery in the deployed Worker (requires valid `LINE_ACCESS_TOKEN`).
- Web Share behavior in LINE in-app browser; clipboard fallback should be used where Web Share is unavailable.

## Remaining high-priority work

- Recurring-task exception editing: convert one occurrence into a normal task and ensure linked shopping/items semantics remain correct.
- Recurring task reminder lifecycle and occurrence-specific notification generation.
- Calendar multi-day bar collision/layout review on narrow iPhones and months spanning six rows.
- Today/Tomorrow information density and child-item presentation.
- Shopping detail/edit consistency after Wave53 compact-list redesign.
- Message editing UI should eventually move from browser prompts to the same modal/form pattern.
- Family invitation lifecycle: list active invites, revoke an unused invite, mark/cull expired invites, and display usage state.
- Login redirect loop cap/error landing page verification.
- Notification cancellation/retry lifecycle audit after member/task/message deletion and conversion.
- Content management permission and tombstone-history review.
- Full SQL placeholder/bind count audit should continue for every INSERT/UPDATE touched by later waves.
