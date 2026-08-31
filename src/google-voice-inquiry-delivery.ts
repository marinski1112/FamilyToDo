import type { GoogleVoiceInquiry, GoogleVoiceInquiryKind } from './google-voice-inquiry';
import { buildGoogleVoiceInquiryPush } from './google-voice-inquiry-push';
import { sendMemberWebPush, type MemberPushResult } from './webpush';

export type GoogleVoiceInquiryLineResolver = (kind: GoogleVoiceInquiryKind) => Promise<readonly string[]>;

export class GoogleVoiceInquiryDeliveryError extends Error {
  constructor(readonly phase: 'PRE_DELIVERY' | 'AMBIGUOUS_DELIVERY') {
    super(phase === 'PRE_DELIVERY' ? 'google-voice-inquiry-pre-delivery-failed' : 'google-voice-inquiry-delivery-outcome-ambiguous');
    this.name = 'GoogleVoiceInquiryDeliveryError';
  }
}

/**
 * Delivers already-authorized inquiry results through the existing member-scoped
 * Web Push transport. Domain reads stay outside this adapter so the runtime can
 * reuse the canonical task/recurrence/shopping visibility semantics.
 *
 * Failures before sendMemberWebPush() are explicitly distinguishable from
 * failures during the transport call. The latter are outcome-ambiguous because
 * a push endpoint may already have accepted a notification before subscription
 * bookkeeping (or another later operation) throws.
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

  let payload;
  try {
    const lines = await resolveLines(inquiry.kind);
    payload = buildGoogleVoiceInquiryPush({ kind: inquiry.kind, lines });
  } catch {
    throw new GoogleVoiceInquiryDeliveryError('PRE_DELIVERY');
  }

  try {
    return await sendMemberWebPush(env, familyId, memberId, payload);
  } catch {
    throw new GoogleVoiceInquiryDeliveryError('AMBIGUOUS_DELIVERY');
  }
}
