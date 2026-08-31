import type { GoogleVoiceInquiry, GoogleVoiceInquiryKind } from './google-voice-inquiry';
import { buildGoogleVoiceInquiryPush } from './google-voice-inquiry-push';
import { sendMemberWebPush, type MemberPushResult } from './webpush';

export type GoogleVoiceInquiryLineResolver = (kind: GoogleVoiceInquiryKind) => Promise<readonly string[]>;

/**
 * Delivers already-authorized inquiry results through the existing member-scoped
 * Web Push transport. Domain reads stay outside this adapter so the runtime can
 * reuse the canonical task/recurrence/shopping visibility semantics.
 */
export async function deliverGoogleVoiceInquiry(
  env: Env,
  familyId: number,
  memberId: number,
  inquiry: GoogleVoiceInquiry,
  resolveLines: GoogleVoiceInquiryLineResolver,
): Promise<MemberPushResult> {
  if (!Number.isSafeInteger(familyId) || familyId <= 0) throw new Error('invalid-family-id');
  if (!Number.isSafeInteger(memberId) || memberId <= 0) throw new Error('invalid-member-id');
  if (inquiry.delivery !== 'MEMBER_WEB_PUSH') throw new Error('unsupported-inquiry-delivery');

  const lines = await resolveLines(inquiry.kind);
  const payload = buildGoogleVoiceInquiryPush({ kind: inquiry.kind, lines });
  return sendMemberWebPush(env, familyId, memberId, payload);
}
