import { deliverGoogleVoiceInquiry, type GoogleVoiceInquiryLineResolver } from './google-voice-inquiry-delivery';
import { parseMarkedGoogleVoiceInquiryCommand } from './google-voice-inquiry';
import type { MemberPushResult } from './webpush';

export type GoogleVoiceInquiryRuntimeResult =
  | { handled: false }
  | { handled: true; kind: 'TODAY_SCHEDULE' | 'TOMORROW_SCHEDULE' | 'OPEN_SHOPPING'; push: MemberPushResult };

/**
 * Composes the deterministic marked INQUIRY parser with the existing
 * member-scoped Web Push delivery adapter. Canonical domain reads stay injected
 * through resolveLines so callers retain task/recurrence/shopping visibility
 * semantics instead of duplicating those queries here.
 */
export async function executeMarkedGoogleVoiceInquiry(
  env: Env,
  familyId: number,
  memberId: number,
  value: unknown,
  resolveLines: GoogleVoiceInquiryLineResolver,
): Promise<GoogleVoiceInquiryRuntimeResult> {
  const inquiry = parseMarkedGoogleVoiceInquiryCommand(value);
  if (!inquiry) return { handled: false };

  const push = await deliverGoogleVoiceInquiry(env, familyId, memberId, inquiry, resolveLines);
  return { handled: true, kind: inquiry.kind, push };
}
