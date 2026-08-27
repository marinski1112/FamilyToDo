# Google integration plan

Wave95 does not implement a Google integration or add provider-specific columns to `tasks`.

## Phases

1. **Google Calendar:** synchronize Family TODO tasks/events with Google Calendar. Before implementation, decide explicitly whether Family TODO, Google Calendar, or neither side (bidirectional conflict resolution) is authoritative.
2. **Google Tasks:** evaluate synchronization only after Calendar identity, deletion, recurrence, and conflict semantics are proven.
3. **Gemini for Home:** allow schedule lookup/addition through Google Calendar, subject to Google's supported capabilities and user authorization.
4. **Family Log:** consider conversational recording only if Google generally offers a suitable custom conversational integration in the future.

The current Google Home cloud-to-cloud device API will not be disguised or abused as a virtual appliance for arbitrary Family TODO commands.

## Identity boundary for a future wave

Prefer a provider-neutral mapping table containing the Family TODO task ID, provider, external calendar/account ID, Google event ID, sync revision/status, and timestamps. Do not spread `google_event_id` or other provider-specific columns through the core `tasks` table. The later sync design must define ownership, conflict resolution, recurrence mapping, deletion/tombstones, authorization revocation, and idempotent retry behavior before adding schema.

## Privacy default

`PRIVATE` tasks must not be synchronized to Google Calendar by default. Titles or other private task data must never leave Family TODO without an explicit, informed opt-in. Family-scoped authorization, least-privilege OAuth scopes, revocation, auditability, and external deletion behavior are prerequisites.
