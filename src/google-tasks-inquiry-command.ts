import { parseMarkedGoogleVoiceInquiryCommand } from './google-voice-inquiry';
import { GoogleVoiceInquiryDeliveryError } from './google-voice-inquiry-delivery';
import { executeMarkedGoogleVoiceInquiry } from './google-voice-inquiry-runtime';
import type { GoogleVoiceInquiryLineResolver } from './google-voice-inquiry-delivery';
import { utcNow } from './timezone';

export type GoogleTasksInquiryAccount = {
  id: number;
  familyId: number;
  memberId: number;
  tasklistId: string;
};

export type GoogleTasksInquiryItem = {
  id: string;
  title: unknown;
  etag?: unknown;
  due?: unknown;
};

export type GoogleTasksInquiryCommandResult = 'not-inquiry' | 'noop' | 'executed' | 'error';

type LedgerRow = { id?: unknown; external_etag?: unknown; status?: unknown; error_code?: unknown };

const RETRYABLE_INQUIRY_ERRORS = new Set([
  'PUSH_NOT_CONFIGURED',
  'NO_PUSH_SUBSCRIPTION',
  'PUSH_DELIVERY_FAILED',
  'INQUIRY_PRE_DELIVERY_ERROR',
]);

function validateAccount(account: GoogleTasksInquiryAccount): void {
  if (!Number.isSafeInteger(account.id) || account.id <= 0) throw new Error('invalid-account-id');
  if (!Number.isSafeInteger(account.familyId) || account.familyId <= 0) throw new Error('invalid-family-id');
  if (!Number.isSafeInteger(account.memberId) || account.memberId <= 0) throw new Error('invalid-member-id');
  if (!String(account.tasklistId || '').trim()) throw new Error('invalid-tasklist-id');
}

function inquiryDeliveryError(delivered: boolean, push: { configured: boolean; subscriptions: number }): string | null {
  if (delivered) return null;
  if (!push.configured) return 'PUSH_NOT_CONFIGURED';
  if (push.subscriptions === 0) return 'NO_PUSH_SUBSCRIPTION';
  return 'PUSH_DELIVERY_FAILED';
}

function canRetryUnchangedInquiry(existing: LedgerRow, item: GoogleTasksInquiryItem): boolean {
  if (String(existing.status) !== 'ERROR') return true;
  if (String(existing.external_etag || '') !== String(item.etag || '')) return true;
  return RETRYABLE_INQUIRY_ERRORS.has(String(existing.error_code || ''));
}

async function persistInquiryLedger(
  env: Env,
  account: GoogleTasksInquiryAccount,
  item: GoogleTasksInquiryItem,
  status: 'EXECUTED' | 'ERROR',
  errorCode: string | null,
): Promise<void> {
  const timestamp = utcNow();
  await env.DB.prepare(`INSERT INTO external_google_voice_commands(
      family_id,member_id,account_id,external_tasklist_id,external_task_id,
      external_etag,external_due,command_type,target_type,target_id,status,error_code,
      created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,'INQUIRY',NULL,NULL,?,?,?,?)
    ON CONFLICT(account_id,external_tasklist_id,external_task_id) DO UPDATE SET
      external_etag=excluded.external_etag,
      external_due=excluded.external_due,
      command_type='INQUIRY',
      target_type=NULL,
      target_id=NULL,
      status=excluded.status,
      error_code=excluded.error_code,
      updated_at=excluded.updated_at
    WHERE external_google_voice_commands.status<>'EXECUTED'`)
    .bind(
      account.familyId,
      account.memberId,
      account.id,
      account.tasklistId,
      String(item.id),
      String(item.etag || ''),
      String(item.due || '') || null,
      status,
      errorCode,
      timestamp,
      timestamp,
    ).run();
}

/**
 * Google Tasks-specific exactly-once envelope for typed INQUIRY commands.
 *
 * Domain reads are deliberately injected via resolveLines. This adapter must not
 * duplicate task/recurrence/shopping queries; the eventual caller supplies the
 * same canonical visibility-aware projection used by the application views.
 *
 * Successful commands remain exactly-once. Failed commands are retried with an
 * unchanged etag only when the failure is known to have happened before a push
 * could be accepted. Outcome-ambiguous failures require an external task change
 * before another delivery attempt, preventing duplicate notifications.
 */
export async function executeGoogleTasksInquiryCommand(
  env: Env,
  account: GoogleTasksInquiryAccount,
  item: GoogleTasksInquiryItem,
  resolveLines: GoogleVoiceInquiryLineResolver,
): Promise<GoogleTasksInquiryCommandResult> {
  const inquiry = parseMarkedGoogleVoiceInquiryCommand(item.title);
  if (!inquiry) return 'not-inquiry';

  validateAccount(account);
  if (!String(item.id || '').trim()) throw new Error('invalid-external-task-id');

  const existing = await env.DB.prepare(`SELECT id,external_etag,status,error_code
      FROM external_google_voice_commands
      WHERE account_id=? AND external_tasklist_id=? AND external_task_id=?`)
    .bind(account.id, account.tasklistId, String(item.id))
    .first<LedgerRow>();

  if (existing && String(existing.status) === 'EXECUTED') {
    return 'noop';
  }
  if (existing && !canRetryUnchangedInquiry(existing, item)) {
    return 'noop';
  }

  try {
    const result = await executeMarkedGoogleVoiceInquiry(
      env,
      account.familyId,
      account.memberId,
      item.title,
      resolveLines,
    );
    if (!result.handled) return 'not-inquiry';

    const errorCode = inquiryDeliveryError(result.push.ok, result.push);
    const status = errorCode ? 'ERROR' : 'EXECUTED';
    await persistInquiryLedger(env, account, item, status, errorCode);
    return errorCode ? 'error' : 'executed';
  } catch (error) {
    const errorCode = error instanceof GoogleVoiceInquiryDeliveryError && error.phase === 'PRE_DELIVERY'
      ? 'INQUIRY_PRE_DELIVERY_ERROR'
      : 'INQUIRY_AMBIGUOUS_RUNTIME_ERROR';
    await persistInquiryLedger(env, account, item, 'ERROR', errorCode);
    return 'error';
  }
}
