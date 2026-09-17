export const TASK_CREATE_SCOPE = 'TASK_CREATE_V1';
export const TASK_CREATE_LEASE_MS = 120000;

type ClaimRow = {
  id: number;
  request_hash: string;
  task_id: number | null;
  status: 'PROCESSING' | 'DONE' | 'ERROR';
  lease_token: string | null;
  lease_expires_at: string | null;
};

export type TaskCreateClaim =
  | { state: 'ACQUIRED'; token: string }
  | { state: 'REPLAY'; taskId: number }
  | { state: 'BUSY' }
  | { state: 'CONFLICT' };

const iso = (date = new Date()) => date.toISOString();
const leaseExpiry = (date = new Date()) => new Date(date.getTime() + TASK_CREATE_LEASE_MS).toISOString();

export function normalizeTaskCreateKey(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key) return '';
  if (key.length < 16 || key.length > 128) return '';
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return '';
  return key;
}

export async function taskCreateRequestHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readClaim(db: D1Database, familyId: number, memberId: number, key: string): Promise<ClaimRow | null> {
  const row = await db.prepare(`SELECT id,request_hash,task_id,status,lease_token,lease_expires_at
    FROM task_create_requests
    WHERE family_id=? AND member_id=? AND scope=? AND idempotency_key=?
    LIMIT 1`).bind(familyId, memberId, TASK_CREATE_SCOPE, key).first<ClaimRow>();
  return row || null;
}

export async function acquireTaskCreateClaim(
  db: D1Database,
  familyId: number,
  memberId: number,
  key: string,
  requestHash: string,
): Promise<TaskCreateClaim> {
  const token = crypto.randomUUID();
  const now = new Date();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO task_create_requests(
      family_id,member_id,scope,idempotency_key,request_hash,status,lease_token,lease_expires_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,'PROCESSING',?,?,?,?)`)
    .bind(familyId, memberId, TASK_CREATE_SCOPE, key, requestHash, token, leaseExpiry(now), iso(now), iso(now)).run();
  if (Number(inserted.meta.changes || 0) === 1) return { state: 'ACQUIRED', token };

  let row = await readClaim(db, familyId, memberId, key);
  if (!row) return { state: 'BUSY' };
  if (String(row.request_hash) !== requestHash) return { state: 'CONFLICT' };
  if (String(row.status) === 'DONE' && Number(row.task_id || 0) > 0) return { state: 'REPLAY', taskId: Number(row.task_id) };

  const nowText = iso(now);
  const reclaimed = await db.prepare(`UPDATE task_create_requests
    SET status='PROCESSING',lease_token=?,lease_expires_at=?,updated_at=?
    WHERE family_id=? AND member_id=? AND scope=? AND idempotency_key=? AND request_hash=?
      AND (status='ERROR' OR (status='PROCESSING' AND COALESCE(lease_expires_at,'')<=?))`)
    .bind(token, leaseExpiry(now), nowText, familyId, memberId, TASK_CREATE_SCOPE, key, requestHash, nowText).run();
  if (Number(reclaimed.meta.changes || 0) === 1) return { state: 'ACQUIRED', token };

  row = await readClaim(db, familyId, memberId, key);
  if (row && String(row.request_hash) !== requestHash) return { state: 'CONFLICT' };
  if (row && String(row.status) === 'DONE' && Number(row.task_id || 0) > 0) return { state: 'REPLAY', taskId: Number(row.task_id) };
  return { state: 'BUSY' };
}

export async function markTaskCreateClaimError(
  db: D1Database,
  familyId: number,
  memberId: number,
  key: string,
  requestHash: string,
  token: string,
): Promise<void> {
  await db.prepare(`UPDATE task_create_requests
    SET status='ERROR',lease_token=NULL,lease_expires_at=NULL,updated_at=?
    WHERE family_id=? AND member_id=? AND scope=? AND idempotency_key=? AND request_hash=?
      AND status='PROCESSING' AND lease_token=?`)
    .bind(iso(), familyId, memberId, TASK_CREATE_SCOPE, key, requestHash, token).run();
}

export async function readCompletedTaskCreate(
  db: D1Database,
  familyId: number,
  memberId: number,
  key: string,
  requestHash: string,
): Promise<number> {
  const row = await db.prepare(`SELECT task_id FROM task_create_requests
    WHERE family_id=? AND member_id=? AND scope=? AND idempotency_key=? AND request_hash=? AND status='DONE'
    LIMIT 1`).bind(familyId, memberId, TASK_CREATE_SCOPE, key, requestHash).first<{task_id:number|null}>();
  return Number(row?.task_id || 0);
}
