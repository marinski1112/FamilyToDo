export const GOOGLE_CALENDAR_INBOUND_MAX_EVENTS=250;

export type GoogleCalendarInboundCalendarBlockReason=
  |'APP_OWNED_CALENDAR_BLOCKED'
  |'CHILD_JOURNAL_CALENDAR_BLOCKED'
  |null;

export type GoogleCalendarInboundClassification=
  |'INVALID_EVENT_ID'
  |'RECURRING_UNSUPPORTED'
  |'APP_OWNED_MARKER'
  |'ALREADY_IMPORTED'
  |'ALREADY_LINKED_OUTBOUND'
  |'ICS_ALREADY_IMPORTED'
  |'AMBIGUOUS_EXISTING_LOCAL'
  |'NEW_CANDIDATE';

export type GoogleCalendarInboundEventLike={
  id?:unknown;
  iCalUID?:unknown;
  recurringEventId?:unknown;
  recurrence?:unknown;
  extendedProperties?:{private?:Record<string,unknown>|null}|null;
};

export type GoogleCalendarInboundEvidence={
  alreadyImported?:boolean;
  outboundLinked?:boolean;
  icsAlreadyImported?:boolean;
  existingLocalCollision?:boolean;
  localScanTruncated?:boolean;
};

const normalizedId=(value:unknown)=>String(value??'').trim();

/**
 * App-owned projection calendars are never valid inbound sources. Keeping this check separate
 * makes the calendar-level gate mandatory before any event preview is considered.
 */
export function googleCalendarInboundCalendarBlockReason(
  selectedCalendarId:unknown,
  appOwnedCalendarId:unknown,
  childJournalCalendarId:unknown,
):GoogleCalendarInboundCalendarBlockReason{
  const selected=normalizedId(selectedCalendarId);
  if(selected&&selected===normalizedId(appOwnedCalendarId))return 'APP_OWNED_CALENDAR_BLOCKED';
  if(selected&&selected===normalizedId(childJournalCalendarId))return 'CHILD_JOURNAL_CALENDAR_BLOCKED';
  return null;
}

/**
 * Pure fail-closed classifier for a future read-only preview adapter. It performs no database
 * writes and deliberately refuses recurring series/instances until their identity semantics are
 * implemented separately. iCalUID is only secondary evidence; Google event.id within calendarId
 * remains the primary external identity.
 */
export function classifyGoogleCalendarInboundEvent(
  event:GoogleCalendarInboundEventLike,
  evidence:GoogleCalendarInboundEvidence={},
):GoogleCalendarInboundClassification{
  if(!normalizedId(event?.id))return 'INVALID_EVENT_ID';
  const recurrence=Array.isArray(event?.recurrence)?event.recurrence:[];
  if(normalizedId(event?.recurringEventId)||recurrence.length)return 'RECURRING_UNSUPPORTED';
  const privateProps=event?.extendedProperties?.private||{};
  if(normalizedId(privateProps.familyTodoTaskId))return 'APP_OWNED_MARKER';
  if(evidence.alreadyImported)return 'ALREADY_IMPORTED';
  if(evidence.outboundLinked)return 'ALREADY_LINKED_OUTBOUND';
  if(evidence.icsAlreadyImported)return 'ICS_ALREADY_IMPORTED';
  // A truncated local collision scan is never permission to call an event new.
  if(evidence.existingLocalCollision||evidence.localScanTruncated)return 'AMBIGUOUS_EXISTING_LOCAL';
  return 'NEW_CANDIDATE';
}
