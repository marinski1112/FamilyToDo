# Wave115 Google Tasks voice bridge

## Architecture and boundaries

The dynamic route uses only official Google services: **Google Home / Gemini for Home voice → Google Tasks → Google Tasks API → Family TODO TASK**. Cloud-to-cloud `ActivateScene` has no arbitrary-text parameter; Family TODO does not add a webhook, Keep scraper, fake QUERY/SensorState, or automatic AI/shopping classification. Each imported task consumes zero Gemini inferences.

Google Tasks is linked per Family TODO member because Voice Match and Personal Results can select a different Google Tasks account. Family TODO does not receive a voice print or Google account email. The trusted recorder identity is only the Family TODO member bound by the inbound OAuth access token. Google Home Cloud-to-cloud continues to allow each adult to Account Link independently.

## Google Cloud configuration

On the existing Google Cloud Web OAuth client (or a dedicated one), add this Authorized redirect URI:

`https://familytodo.marinski1112.workers.dev/oauth/google-tasks/callback`

Add Data Access scope `https://www.googleapis.com/auth/tasks`. Existing OAuth test users can be used while the consent screen is in testing. Never place a client secret in documentation or source.

Worker configuration is separated from Google Home credentials:

- `GOOGLE_TASKS_CLIENT_ID` (fallback: `GOOGLE_CALENDAR_CLIENT_ID`)
- `GOOGLE_TASKS_CLIENT_SECRET` (fallback: `GOOGLE_CALENDAR_CLIENT_SECRET`)
- `GOOGLE_TASKS_TOKEN_KEY` (fallback: `GOOGLE_CALENDAR_TOKEN_KEY`)
- `GOOGLE_TASKS_REDIRECT_URI` (defaults to the production callback above)

Refresh tokens are AES-GCM encrypted; raw credentials and payloads are neither logged nor shown.

## Import policy

After OAuth, `/tasks/v1/users/@me/lists` discovers lists. The user must create a voice task on the real device, identify its destination list, and explicitly select that single list. Google-side settings control the voice destination, so Family TODO does not promise a particular list and never imports all lists.

Only changes at/after `sync_started_at` are imported. Incremental requests use `updatedMin`, a one-minute overlap, `showCompleted`, `showHidden`, `showDeleted`, pagination, and ID + etag deduplication. Cron work is bounded to 4 accounts, 3 pages/account, and 200 tasks/account. Manual sync uses a D1 lease.

Mapping is title → title, notes → description, due date → all-day due, and status → the linked member's completion. Google Tasks exposes only the due date; **time is not preserved or invented**. Use Google Calendar for timed events. New tasks are assigned to and created by the linked member, default PRIVATE, and become FAMILY only after explicit opt-in. They use `calendar_visible=0`, preventing Calendar projection loops.

External edits update only an unedited imported task. A local edit creates `CONFLICT`. External deletion creates a `TOMBSTONE` and never hard-deletes the Family TODO task. Existing Family TODO tasks are not backfilled and names are never used for matching.

## Real-device checklist

1. Apply migration `0038_wave115_google_tasks_voice_inbox.sql` and deploy the Worker.
2. Add the redirect URI and Tasks scope to Google Cloud, then connect each adult under 管理 → 外部連携 → Google Tasks.
3. For each Voice Match user, enable Personal Results as appropriate, create a harmless task by voice, inspect which Google list received it, and select that list in Family TODO.
4. Keep PRIVATE for initial verification. Run 今すぐ同期 and verify title/no-due/due-date behavior, linked assignee, no Calendar duplicate, completion, edit conflict, and deletion tombstone.
5. Only after privacy review, explicitly switch an account to FAMILY if household sharing is desired.
6. In Google Home diagnostics verify each linked member's active/revoked state and that the last execution shows only operation, result, and Family TODO recorder member.

Voice-created Calendar events can continue through Google Home / Gemini for Home → Google Calendar → Family TODO EVENT where Google permits choosing the Family TODO calendar. Upcoming-event answers should be provided by Google Home from Google Calendar; Family TODO does not fabricate a schedule QUERY. Past schedule/growth questions remain in Family AI.

Family TODO does not promise a particular list as the Google Home voice destination.
