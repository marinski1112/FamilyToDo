import { deliverGoogleVoiceInquiry, type GoogleVoiceInquiryLineResolver } from './google-voice-inquiry-delivery';
import { extractMarkedGoogleVoiceInquiryBody, isDeterministicGoogleVoiceWriteBody, parseMarkedGoogleVoiceInquiryCommand } from './google-voice-inquiry';
import { classifyMarkedGoogleVoiceInquiryWithGemini } from './google-voice-inquiry-gemini';
import type { MemberPushResult } from './webpush';

export type GoogleVoiceInquiryRuntimeResult =
  | { handled: false }
  | { handled: true; kind: 'TODAY_SCHEDULE' | 'TOMORROW_SCHEDULE' | 'OPEN_SHOPPING'; push: MemberPushResult };

/**
 * Composes deterministic marked INQUIRY parsing with the existing member-scoped
 * delivery boundary. Only an explicitly marked command that misses the exact
 * parser and is not owned by a deterministic write-command family may use the
 * narrow Gemini classifier. Upstream/ambiguous classification falls through
 * without delivery or mutation.
 */
export async function executeMarkedGoogleVoiceInquiry(
  env: Env,
  familyId: number,
  memberId: number,
  value: unknown,
  resolveLines: GoogleVoiceInquiryLineResolver,
): Promise<GoogleVoiceInquiryRuntimeResult> {
  let inquiry = parseMarkedGoogleVoiceInquiryCommand(value);
  if (!inquiry) {
    const body = extractMarkedGoogleVoiceInquiryBody(value);
    if (body === null) return { handled: false };
    if (isDeterministicGoogleVoiceWriteBody(body)) return { handled: false };
    inquiry = await classifyMarkedGoogleVoiceInquiryWithGemini(env, familyId, body);
  }
  if (!inquiry) return { handled: false };

  const push = await deliverGoogleVoiceInquiry(env, familyId, memberId, inquiry, resolveLines);
  return { handled: true, kind: inquiry.kind, push };
}