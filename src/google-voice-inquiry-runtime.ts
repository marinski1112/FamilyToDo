import type { GoogleVoiceInquiry } from './google-voice-inquiry';
import { buildGoogleVoiceInquiryPush } from './google-voice-inquiry-push';
import { sendMemberWebPush, type MemberPushResult } from './webpush';

const MAX_INQUIRY_ROWS = 9;
const FAMILY_TIME_ZONE = 'Asia/Tokyo';

type Row = Record<string, unknown>;

export type GoogleVoiceInquiryIdentity = {
  familyId: number;
  memberId: number;
};

export type GoogleVoiceInquiryRuntimeResult = {
  kind: GoogleVoiceInquiry['kind'];
  rows: number;
  push: MemberPushResult;
};

function assertIdentity(identity: GoogleVoiceInquiryIdentity): void {
  if (!Number.isSafeInteger(identity.familyId) || identity.familyId <= 0) throw new Error('INVALID_FAMILY_ID');
  if (!Number.isSafeInteger(identity.memberId) || identity.memberId <= 0) throw new Error('INVALID_MEMBER_ID');
}

function familyDate(offsetDays: number): string {
  const shifted = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FAMILY_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(shifted);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function scheduleLines(env: Env, identity: GoogleVoiceInquiryIdentity, offsetDays: number): Promise<string[]> {
  const date = familyDate(offsetDays);
  const rows = await env.DB.prepare(`
    SELECT t.title
      FROM tasks t
     WHERE t.family_id=?
       AND t.status<>'completed'
       AND (COALESCE(t.visibility_scope,'FAMILY')='FAMILY'
         OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?))
       AND COALESCE(t.start_at,t.due_at) IS NOT NULL
       AND date(COALESCE(t.start_at,t.due_at)) <= date(?)
       AND date(COALESCE(t.end_at,t.due_at,t.start_at)) >= date(?)
     ORDER BY COALESCE(t.start_at,t.due_at), t.id
     LIMIT ?
  `).bind(identity.familyId, identity.memberId, date, date, MAX_INQUIRY_ROWS).all<Row>();
  return rows.results.map((row) => String(row.title || '').trim()).filter(Boolean);
}

async function shoppingLines(env: Env, identity: GoogleVoiceInquiryIdentity): Promise<string[]> {
  const rows = await env.DB.prepare(`
    SELECT s.name, s.quantity
      FROM shopping_items s
      LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
     WHERE s.family_id=?
       AND s.status<>'completed'
       AND (s.task_id IS NULL
         OR (t.id IS NOT NULL AND (COALESCE(t.visibility_scope,'FAMILY')='FAMILY'
           OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?))))
     ORDER BY CASE WHEN s.due_date IS NULL OR s.due_date='' THEN 1 ELSE 0 END,
              s.due_date,
              s.id
     LIMIT ?
  `).bind(identity.familyId, identity.memberId, MAX_INQUIRY_ROWS).all<Row>();
  return rows.results.map((row) => {
    const name = String(row.name || '').trim();
    const quantity = String(row.quantity || '').trim();
    return quantity && quantity !== '1' ? `${name} ×${quantity}` : name;
  }).filter(Boolean);
}

/**
 * Executes an already typed Google voice inquiry for exactly one authenticated
 * family/member pair. Reads are tenant-scoped and PRIVATE parent tasks remain
 * owner-only. Output is bounded before the existing member-scoped Web Push
 * transport is invoked; no family-wide notification path is used here.
 */
export async function executeGoogleVoiceInquiry(
  env: Env,
  identity: GoogleVoiceInquiryIdentity,
  inquiry: GoogleVoiceInquiry,
): Promise<GoogleVoiceInquiryRuntimeResult> {
  assertIdentity(identity);
  let lines: string[];
  if (inquiry.kind === 'TODAY_SCHEDULE') lines = await scheduleLines(env, identity, 0);
  else if (inquiry.kind === 'TOMORROW_SCHEDULE') lines = await scheduleLines(env, identity, 1);
  else lines = await shoppingLines(env, identity);

  const payload = buildGoogleVoiceInquiryPush({ kind: inquiry.kind, lines });
  const push = await sendMemberWebPush(env, identity.familyId, identity.memberId, payload);
  return { kind: inquiry.kind, rows: lines.length, push };
}

export const GOOGLE_VOICE_INQUIRY_RUNTIME_LIMITS = { maxRows: MAX_INQUIRY_ROWS } as const;
